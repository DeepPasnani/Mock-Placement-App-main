import Joi from 'joi';
import { isValidLanguageId } from '../../languages/index.js';
import config from '../../utils/config.js';

const submissionSchema = Joi.object({
  source_code: Joi.string().required().max(config.execution.maxSourceSize),
  language_id: Joi.number().integer().required(),
  stdin: Joi.string().allow('').max(65536).default(''),
  expected_output: Joi.string().allow('').max(65536).optional(),
  cpu_time_limit: Joi.number().positive().max(config.execution.maxCpuTimeLimit).default(config.execution.defaultCpuTimeLimit),
  cpu_extra_time: Joi.number().min(0).max(5).default(1),
  wall_time_limit: Joi.number().positive().max(config.execution.maxWallTimeLimit).default(config.execution.defaultWallTimeLimit),
  memory_limit: Joi.number().positive().max(config.execution.maxMemoryLimit).default(config.execution.defaultMemoryLimit),
  stack_limit: Joi.number().positive().max(config.execution.defaultStackLimit).default(config.execution.defaultStackLimit),
  max_processes_and_or_threads: Joi.number().positive().max(config.execution.maxProcesses).default(config.execution.maxProcesses),
  max_file_size: Joi.number().positive().max(4096).default(1024),
  compiler_options: Joi.string().allow('').max(1024).optional(),
  command_line_arguments: Joi.string().allow('').max(1024).optional(),
  redirect_stderr_to_stdout: Joi.boolean().default(false),
  enable_network: Joi.boolean().default(false),
  callback_url: Joi.string().uri().max(2048).optional(),
  additional_files: Joi.string().allow('').max(config.execution.maxAdditionalFilesSize).optional(),
});

const batchSubmissionSchema = Joi.object({
  submissions: Joi.array().items(submissionSchema).min(1).max(20).required(),
});

export function sanitizeCompilerOptions(options) {
  if (!options) return null;
  return options.replace(/[;&|`$(){}!<>]/g, '').substring(0, 1024);
}

export function sanitizeCommandLineArgs(args) {
  if (!args) return null;
  return args.replace(/[;&|`$(){}!<>]/g, '').substring(0, 1024);
}

export function validateSubmission(req, res, next) {
  const { error, value } = submissionSchema.validate(req.body, { stripUnknown: true });
  if (error) {
    return res.status(400).json({
      error: 'Bad Request',
      message: error.details[0].message,
    });
  }
  if (!isValidLanguageId(value.language_id)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Invalid language_id: ${value.language_id}`,
    });
  }
  req.validatedBody = value;
  next();
}

export function validateBatchSubmission(req, res, next) {
  const { error, value } = batchSubmissionSchema.validate(req.body, { stripUnknown: true });
  if (error) {
    return res.status(400).json({
      error: 'Bad Request',
      message: error.details[0].message,
    });
  }
  for (const sub of value.submissions) {
    if (!isValidLanguageId(sub.language_id)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid language_id: ${sub.language_id}`,
      });
    }
  }
  req.validatedBody = value;
  next();
}

export default { validateSubmission, validateBatchSubmission, sanitizeCompilerOptions, sanitizeCommandLineArgs };
