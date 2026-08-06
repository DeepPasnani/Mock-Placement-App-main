import { getExecutor } from '../../executor/ExecutorFactory.js';
import { getStatusById } from '../../languages/index.js';
import logger from '../../utils/logger.js';

export async function executeCode(submission) {
  const executor = getExecutor();

  try {
    logger.info({
      event: 'executing_code',
      token: submission.token,
      language_id: submission.language_id,
      executor_type: executor.constructor.name,
    });

    const result = await executor.execute(submission);

    logger.info({
      event: 'execution_completed',
      token: submission.token,
      status: result.status?.id,
      time: result.time,
    });

    return result;
  } catch (error) {
    logger.error({
      event: 'execution_failed',
      token: submission.token,
      error: error.message,
    });

    return {
      status: getStatusById(13),
      stdout: null,
      stderr: null,
      compile_output: null,
      message: error.message,
      time: null,
      wall_time: null,
      memory: null,
      exit_code: null,
      exit_signal: null,
    };
  }
}

export function compareOutput(stdout, expectedOutput) {
  if (stdout === null || stdout === undefined) return false;
  if (expectedOutput === null || expectedOutput === undefined) return true;

  const tokenize = (str) => String(str)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/[ \t\n\r]+/)
    .filter((tok) => tok.length > 0);

  const actual = tokenize(stdout);
  const expected = tokenize(expectedOutput);

  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

export default { executeCode, compareOutput };
