#!/usr/bin/env node
'use strict';

// Legacy alias for the pre-rename entrypoint. The public package exposes `skillcanary`.
require('../src/cli').main(process.argv.slice(2));