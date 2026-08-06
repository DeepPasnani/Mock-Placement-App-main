import Docker from 'dockerode';
import { Readable } from 'stream';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { getStatusById } from '../languages/index.js';
import ResultParser from './ResultParser.js';
import ContainerPool from './ContainerPool.js';

class DockerExecutor {
  constructor() {
    this.docker = new Docker({ socketPath: config.docker.socketPath });
    this.resultParser = new ResultParser();
    this.pool = new ContainerPool();
  }

  async execute(submission) {
    const { language } = submission;
    let container = null;
    let fromPool = false;

    try {
      if (config.docker.containerPoolEnabled) {
        container = await this.pool.acquire(language);
        if (container) {
          fromPool = true;
          await this.runCommand(container, 'rm -rf /box && mkdir -p /box', null, 10, '');
        }
      }

      if (!container) {
        container = await this.createContainer(submission);
        await container.start();
      }

      await this.copySourceCode(container, submission);

      if (submission.additional_files) {
        await this.copyAdditionalFiles(container, submission);
      }

      if (language.compile_cmd) {
        const compileResult = await this.runCommand(
          container,
          language.compile_cmd,
          submission.compiler_options,
          submission.cpu_time_limit + submission.cpu_extra_time,
          ''
        );

        if (compileResult.exitCode !== 0) {
          return {
            status: getStatusById(6),
            compile_output: compileResult.stderr || compileResult.stdout,
            time: null,
            wall_time: null,
            memory: null,
            stdout: null,
            stderr: null,
            exit_code: compileResult.exitCode,
            exit_signal: null,
          };
        }
      }

      const runCmd = this.buildRunCommand(language.run_cmd, submission.command_line_arguments);
      const result = await this.runCommand(
        container,
        runCmd,
        null,
        submission.wall_time_limit,
        submission.stdin
      );

      return this.resultParser.parse(result, submission);
    } catch (error) {
      logger.error({
        event: 'execution_error',
        token: submission.token,
        error: error.message,
      });

      return {
        status: getStatusById(13),
        message: error.message,
        time: null,
        wall_time: null,
        memory: null,
        stdout: null,
        stderr: null,
        compile_output: null,
        exit_code: null,
        exit_signal: null,
      };
    } finally {
      if (container) {
        try {
          if (fromPool) {
            await this.pool.release(language, container);
          } else {
            await container.stop({ t: 1 }).catch(() => {});
            await container.remove({ force: true });
          }
        } catch (err) {
          logger.warn({ err }, 'Failed to cleanup container');
        }
      }
    }
  }

  async createContainer(submission) {
    const { language, memory_limit, max_processes_and_or_threads, enable_network } = submission;

    const effectiveMemory = Math.max(memory_limit, language.min_memory || 0);
    const boxSize = Math.max(Math.ceil(effectiveMemory / 1024), 128);

    const containerConfig = {
      Image: language.image,
      Cmd: ['/bin/sh', '-c', 'sleep 3600'],
      WorkingDir: '/box',
      NetworkDisabled: !enable_network,
      HostConfig: {
        Memory: effectiveMemory * 1024,
        MemorySwap: effectiveMemory * 1024,
        CpuPeriod: 100000,
        CpuQuota: 100000,
        PidsLimit: max_processes_and_or_threads,
        NetworkMode: enable_network ? 'bridge' : 'none',
        ReadonlyRootfs: false,
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'],
        MaskedPaths: [
          '/etc/passwd', '/etc/shadow', '/etc/group', '/etc/gshadow',
          '/etc/hostname', '/etc/hosts', '/etc/resolv.conf',
          '/proc/kcore', '/proc/keys', '/proc/latency_stats',
          '/proc/timer_list', '/proc/timer_stats', '/proc/sched_debug',
          '/proc/scsi', '/proc/acpi', '/proc/bus',
          '/proc/1/environ', '/proc/1/cmdline', '/proc/1/maps',
          '/sys/firmware', '/sys/devices',
        ],
        ReadonlyPaths: ['/proc', '/sys'],
        // uid/gid=1000 so the non-root image user can write. Docker putArchive
        // silently no-ops into tmpfs, so we write files via exec stdin instead.
        Tmpfs: {
          '/tmp': `rw,noexec,nosuid,size=64m,uid=1000,gid=1000`,
          '/box': `rw,exec,nosuid,size=${boxSize}m,uid=1000,gid=1000`,
          '/home': 'rw,noexec,nosuid,size=16m,uid=1000,gid=1000',
        },
        Binds: [],
      },
      Tty: false,
      OpenStdin: true,
      StdinOnce: true,
    };

    return await this.docker.createContainer(containerConfig);
  }

  async copySourceCode(container, submission) {
    const { language, source_code } = submission;
    const fileName = language.source_file;
    // Docker putArchive silently no-ops into tmpfs mounts (/box is tmpfs).
    // Write the source via exec stdin instead.
    const content = Buffer.isBuffer(source_code)
      ? source_code.toString('utf-8')
      : String(source_code ?? '');
    const result = await this.runCommand(
      container,
      `cat > "/box/${fileName}"`,
      null,
      10,
      content
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to write source file ${fileName}`);
    }
  }

  async copyAdditionalFiles(container, submission) {
    const { additional_files } = submission;
    try {
      // Decode base64 zip via stdin into tmpfs /box (putArchive cannot write tmpfs).
      const writeResult = await this.runCommand(
        container,
        'base64 -d > /box/_additional.zip',
        null,
        15,
        String(additional_files || '').replace(/\s+/g, '')
      );
      if (writeResult.exitCode !== 0) {
        throw new Error(writeResult.stderr || 'Failed to write additional files archive');
      }

      const checkResult = await this.runCommand(
        container,
        'unzip -l /box/_additional.zip | grep -q "\\.\\./\\|/\\.\\." && echo TRAVERSAL_FOUND || echo OK',
        null,
        10,
        ''
      );

      if (checkResult.stdout.trim().includes('TRAVERSAL_FOUND')) {
        await this.runCommand(container, 'rm /box/_additional.zip', null, 5, '');
        throw new Error('ZIP archive contains path traversal entries');
      }

      const extractResult = await this.runCommand(
        container,
        'unzip -n -qq /box/_additional.zip -d /box && rm /box/_additional.zip',
        null,
        10,
        ''
      );

      if (extractResult.exitCode !== 0) {
        throw new Error(extractResult.stderr || 'Failed to extract ZIP archive');
      }
    } catch (error) {
      throw new Error(`Failed to copy additional files: ${error.message}`);
    }
  }

  createTarStream(fileName, content) {
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const fileNameBuffer = Buffer.from(fileName);
    const header = Buffer.alloc(512, 0);
    fileNameBuffer.copy(header, 0, 0, Math.min(fileNameBuffer.length, 100));
    Buffer.from('0000644\0').copy(header, 100);
    Buffer.from('0000000\0').copy(header, 108);
    Buffer.from('0000000\0').copy(header, 116);
    const sizeOctal = contentBuffer.length.toString(8).padStart(11, '0') + '\0';
    Buffer.from(sizeOctal).copy(header, 124);
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
    Buffer.from(mtime).copy(header, 136);
    Buffer.from('        ').copy(header, 148);
    header[156] = 48;
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
    Buffer.from(checksumOctal).copy(header, 148);
    const remainder = contentBuffer.length % 512;
    const paddingSize = remainder === 0 ? 0 : 512 - remainder;
    const contentPadding = Buffer.alloc(paddingSize, 0);
    const endBlocks = Buffer.alloc(1024, 0);
    const tarBuffer = Buffer.concat([header, contentBuffer, contentPadding, endBlocks]);
    return Readable.from(tarBuffer);
  }

  buildRunCommand(baseCmd, args) {
    if (!args) return baseCmd;
    return `${baseCmd} ${args}`;
  }

  async runCommand(container, command, extraOptions, timeoutSecs, stdin) {
    const startTime = Date.now();
    let baseline = null;
    try {
      baseline = await this.readCgroupBaseline(container);
    } catch (err) {
      logger.warn({ err }, 'Failed to read container CPU baseline');
    }
    const execResult = await this.execRaw(container, command, timeoutSecs, stdin);
    const endTime = Date.now();

    let cpuSec = null;
    let memoryKb = null;
    try {
      if (baseline && !execResult.timedOut && execResult.exitCode !== -1) {
        const afterCpuNs = await this.readCpuUsageNs(container, baseline.version);
        if (baseline.cpuNs !== null && afterCpuNs !== null && afterCpuNs >= baseline.cpuNs) {
          cpuSec = (afterCpuNs - baseline.cpuNs) / 1e9;
        }
        memoryKb = await this.readMemoryPeakKb(container, baseline.version);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to read container resource usage');
    }

    return {
      stdout: execResult.stdout,
      stderr: execResult.stderr,
      exitCode: execResult.exitCode,
      wallTime: (endTime - startTime) / 1000,
      time: cpuSec ?? (endTime - startTime) / 1000,
      memory: memoryKb,
      stdoutTruncated: execResult.stdoutTruncated,
      stderrTruncated: execResult.stderrTruncated,
      timedOut: execResult.timedOut,
    };
  }

  async execRaw(container, command, timeoutSecs, stdin) {
    const exec = await container.exec({
      Cmd: ['/bin/sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: !!stdin,
      WorkingDir: '/box',
    });

    return new Promise((resolve, reject) => {
      const timeoutMs = timeoutSecs * 1000;
      const maxOutputSize = config.docker.maxOutputSize;
      let timedOut = false;
      let stdoutTruncated = false;
      let stderrTruncated = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        container.kill().catch(() => {});
      }, timeoutMs);

      exec.start({ hijack: true, stdin: !!stdin }, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          return reject(err);
        }

        if (stdin) {
          stream.write(stdin);
          stream.end();
        }

        const stdoutChunks = [];
        const stderrChunks = [];
        let stdoutLen = 0;
        let stderrLen = 0;
        let buffer = Buffer.alloc(0);

        stream.on('data', (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          let offset = 0;
          while (buffer.length - offset >= 8) {
            const streamType = buffer[offset];
            const size = buffer.readUInt32BE(offset + 4);
            if (buffer.length - offset < 8 + size) break;
            const data = buffer.slice(offset + 8, offset + 8 + size);
            if (streamType === 1) {
              if (stdoutLen < maxOutputSize) {
                const remaining = maxOutputSize - stdoutLen;
                if (data.length <= remaining) {
                  stdoutChunks.push(data);
                  stdoutLen += data.length;
                } else {
                  stdoutChunks.push(data.slice(0, remaining));
                  stdoutLen += remaining;
                  stdoutTruncated = true;
                }
              } else {
                stdoutTruncated = true;
              }
            } else if (streamType === 2) {
              if (stderrLen < maxOutputSize) {
                const remaining = maxOutputSize - stderrLen;
                if (data.length <= remaining) {
                  stderrChunks.push(data);
                  stderrLen += data.length;
                } else {
                  stderrChunks.push(data.slice(0, remaining));
                  stderrLen += remaining;
                  stderrTruncated = true;
                }
              } else {
                stderrTruncated = true;
              }
            }
            offset += 8 + size;
          }
          buffer = buffer.slice(offset);
          if (buffer.length > 64 * 1024) {
            buffer = Buffer.alloc(0);
            stdoutTruncated = true;
            stderrTruncated = true;
          }
        });

        stream.on('end', async () => {
          clearTimeout(timeout);
          let stdout = '';
          let stderr = '';
          if (stdoutChunks.length) stdout = Buffer.concat(stdoutChunks).toString('utf-8');
          if (stderrChunks.length) stderr = Buffer.concat(stderrChunks).toString('utf-8');
          let exitCode = 0;
          try {
            const inspection = await exec.inspect();
            exitCode = inspection.ExitCode;
          } catch (e) {
            exitCode = timedOut ? 124 : -1;
          }
          resolve({
            stdout,
            stderr,
            exitCode,
            stdoutTruncated,
            stderrTruncated,
            timedOut,
          });
        });

        stream.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    });
  }

  async readCgroupBaseline(container) {
    const res = await this.execRaw(
      container,
      "if [ -f /sys/fs/cgroup/memory.peak ]; then echo V2; sed -n 's/^usage_usec[[:space:]]*//p' /sys/fs/cgroup/cpu.stat 2>/dev/null; else echo V1; cat /sys/fs/cgroup/cpuacct/cpuacct.usage 2>/dev/null; fi",
      5,
      ''
    );
    const lines = (res.stdout || '').trim().split('\n').filter(Boolean);
    const version = lines[0] === 'V2' ? 'v2' : 'v1';
    const raw = parseInt(lines[1], 10);
    let cpuNs = null;
    if (!Number.isNaN(raw) && raw >= 0) {
      cpuNs = version === 'v2' ? raw * 1000 : raw;
    }
    return { version, cpuNs };
  }

  async readCpuUsageNs(container, version) {
    if (version === 'v2') {
      const res = await this.execRaw(
        container,
        'sed -n \'s/^usage_usec[[:space:]]*//p\' /sys/fs/cgroup/cpu.stat 2>/dev/null',
        5,
        ''
      );
      const us = parseInt((res.stdout || '').trim(), 10);
      return Number.isNaN(us) || us < 0 ? null : us * 1000;
    }
    const res = await this.execRaw(
      container,
      'cat /sys/fs/cgroup/cpuacct/cpuacct.usage 2>/dev/null',
      5,
      ''
    );
    const ns = parseInt((res.stdout || '').trim(), 10);
    return Number.isNaN(ns) || ns < 0 ? null : ns;
  }

  async readMemoryPeakKb(container, version) {
    if (version === 'v2') {
      const res = await this.execRaw(
        container,
        'cat /sys/fs/cgroup/memory.peak 2>/dev/null',
        5,
        ''
      );
      const val = parseInt((res.stdout || '').trim(), 10);
      return Number.isNaN(val) || val <= 0 ? null : Math.ceil(val / 1024);
    }
    const res = await this.execRaw(
      container,
      'cat /sys/fs/cgroup/memory/memory.max_usage_in_bytes 2>/dev/null',
      5,
      ''
    );
    const val = parseInt((res.stdout || '').trim(), 10);
    return Number.isNaN(val) || val <= 0 ? null : Math.ceil(val / 1024);
  }
}

export default DockerExecutor;
