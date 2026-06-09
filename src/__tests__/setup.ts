// Silence Pino output for the entire test suite.
// The logger reads LOG_LEVEL once at module-load time, so this must run
// before any source file is imported — i.e. via jest setupFiles, not
// setupFilesAfterFramework.
process.env['LOG_LEVEL'] = 'silent';
