const OError = require('@overleaf/o-error')
const { Errors } = require('@overleaf/object-persistor')

class HealthCheckError extends OError {}
class ConversionsDisabledError extends OError {}
class ConversionError extends OError {}
class TimeoutError extends OError {}
class InvalidParametersError extends OError {}

class FailedCommandError extends OError {
  constructor(command, code, stdout, stderr) {
    super('command failed with error exit code', {
      command,
      code
    })
    this.stdout = stdout
    this.stderr = stderr
    this.code = code
  }
}

module.exports = {
  FailedCommandError,
  ConversionsDisabledError,
  ConversionError,
  HealthCheckError,
  TimeoutError,
  InvalidParametersError,
  ...Errors
}
