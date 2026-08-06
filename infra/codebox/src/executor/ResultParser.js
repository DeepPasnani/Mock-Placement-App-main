import { getStatusById } from '../languages/index.js';

class ResultParser {
  parse(result, submission) {
    const { stdout, stderr, exitCode, wallTime, time, memory, timedOut, stdoutTruncated, stderrTruncated } = result;

    let status;
    let compileOutput = null;
    let actualStdout = stdout;
    let actualStderr = stderr;

    if (timedOut) {
      status = getStatusById(5);
    } else if (exitCode === 124) {
      status = getStatusById(5);
    } else if (exitCode !== 0) {
      const isCompileError = stderr && (
        stderr.toLowerCase().includes('error') ||
        stderr.toLowerCase().includes('syntaxerror') ||
        stderr.toLowerCase().includes('referenceerror')
      );

      if (isCompileError && submission.language.compile_cmd) {
        status = getStatusById(6);
        compileOutput = stderr;
      } else {
        status = getStatusById(11);
      }
    } else {
      status = getStatusById(3);
    }

    return {
      status,
      stdout: actualStdout,
      stderr: actualStderr,
      compile_output: compileOutput,
      time: time != null ? Number(time).toFixed(3) : null,
      wall_time: wallTime != null ? Number(wallTime).toFixed(3) : null,
      memory,
      exit_code: exitCode,
      exit_signal: null,
      output_truncated: !!(stdoutTruncated || stderrTruncated),
      message: timedOut ? 'Execution timed out' : null,
    };
  }
}

export default ResultParser;
