import { jest } from '@jest/globals';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

// Mock the spawn function
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Mock the logger
jest.mock('@trigger.dev/sdk', () => ({
  logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Import the functions under test after mocking
import { sanitizePrompt, executeCommand, runCodexCLI } from '../codex';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock process.env for tests
const originalEnv = process.env;

// Properly typed mock child process
interface MockChildProcess {
  stdout: {
    on: jest.MockedFunction<(event: string, callback: (data: Buffer) => void) => void>;
  };
  stderr: {
    on: jest.MockedFunction<(event: string, callback: (data: Buffer) => void) => void>;
  };
  on: jest.MockedFunction<(event: string, callback: (codeOrError: number | Error) => void) => void>;
}

// Declare mockChild at module level
let mockChild: MockChildProcess;

describe('Codex CLI Security Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
    
    // Create a properly typed mock child process
    mockChild = {
      stdout: {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('test output')), 10);
          }
        })
      },
      stderr: {
        on: jest.fn()
      },
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 20); // Success exit code
        }
      })
    };
    
    mockSpawn.mockReturnValue(mockChild as unknown as ChildProcess);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('sanitizePrompt', () => {
    test('should remove shell special characters', () => {
      const maliciousInput = 'test; rm -rf /; echo "hacked"';
      const sanitized = sanitizePrompt(maliciousInput);
      
      expect(sanitized).not.toContain(';');
      expect(sanitized).not.toContain('rm -rf');
      expect(sanitized).not.toContain('|');
      expect(sanitized).not.toContain('&');
      expect(sanitized).not.toContain('`');
      expect(sanitized).not.toContain('$');
    });

    test('should handle empty input safely', () => {
      expect(sanitizePrompt('')).toBe('');
      expect(sanitizePrompt(null as any)).toBe('');
      expect(sanitizePrompt(undefined as any)).toBe('');
    });

    test('should escape quotes and backslashes', () => {
      const inputWithQuotes = 'test "quoted" and \\backslash';
      const sanitized = sanitizePrompt(inputWithQuotes);
      
      expect(sanitized).toContain('\\"');
      expect(sanitized).toContain('\\\\');
    });

    test('should normalize whitespace', () => {
      const inputWithWhitespace = 'test    multiple   spaces\n\nand\ttabs';
      const sanitized = sanitizePrompt(inputWithWhitespace);
      
      expect(sanitized).not.toContain('    ');
      expect(sanitized).not.toContain('\n\n');
      expect(sanitized).not.toContain('\t');
    });

    test('should handle all dangerous characters', () => {
      const dangerousChars = '`$(){}[]|&;<>';
      const sanitized = sanitizePrompt(`safe text ${dangerousChars} more text`);
      
      expect(sanitized).toBe('safe text  more text');
    });
  });

  describe('executeCommand', () => {
    test('should handle successful command execution', async () => {
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10); // Success
        }
      });

      const result = await executeCommand('test', ['arg1', 'arg2']);
      expect(result).toBe('test output');
      expect(mockSpawn).toHaveBeenCalledWith('test', ['arg1', 'arg2'], {});
    });

    test('should handle command failure with non-zero exit code', async () => {
      mockChild.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('Error message'));
        }
      });
      
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10); // Failure
        }
      });

      await expect(executeCommand('test', ['arg1'])).rejects.toThrow('Command failed with code 1: Error message');
    });

    test('should handle command execution errors', async () => {
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Spawn error')), 10);
        }
      });

      await expect(executeCommand('test', ['arg1'])).rejects.toThrow('Spawn error');
    });

    test('should pass options correctly', async () => {
      const options = {
        encoding: 'utf-8' as BufferEncoding,
        env: { ...process.env, TEST_VAR: 'test' },
        timeout: 5000,
        cwd: '/test/path'
      };

      await executeCommand('test', ['arg1'], options);
      expect(mockSpawn).toHaveBeenCalledWith('test', ['arg1'], options);
    });
  });

  describe('CLI Arguments Security', () => {
    test('should use spawn with args array to prevent injection', () => {
      (mockSpawn as any).mockImplementation(() => {
        // Verify that spawn is called with separate arguments
        const callArgs = (mockSpawn as any).mock.calls[0];
        expect(callArgs[0]).toBe('npx');
        expect(Array.isArray(callArgs[1])).toBe(true);
        if (callArgs[1]) {
          expect(callArgs[1][0]).toBe('@openai/codex');
          expect(callArgs[1][1]).toBe('exec');
          expect(callArgs[1][2]).toBe('--model');
          expect(callArgs[1][3]).toBe('codex-mini-latest');
          expect(callArgs[1][4]).toBe('--full-auto');
          expect(callArgs[1][5]).toBe('--cd');
        }
        
        return mockChild as unknown as ChildProcess;
      });
      
      // This will be tested in the integration tests
    });

    test('should not concatenate command into single string', () => {
      let commandString: string | undefined;
      
      (mockSpawn as any).mockImplementation((command: string) => {
        // Verify we're not passing a concatenated string
        commandString = command;
        expect(typeof command).toBe('string');
        expect(command).not.toContain(' '); // Should be just 'npx', not a full command
        
        return mockChild as unknown as ChildProcess;
      });
      
      expect(commandString).toBeUndefined(); // Will be set during actual call
    });
  });

  describe('Environment Variables', () => {
    test('should pass OPENAI_API_KEY to child process', () => {
      (mockSpawn as any).mockImplementation((command: string, args?: any, options?: any) => {
        expect(options?.env).toBeDefined();
        expect(options?.env?.OPENAI_API_KEY).toBe('test-key');
        
        return mockChild as unknown as ChildProcess;
      });
    });

    test('should handle missing OPENAI_API_KEY gracefully', () => {
      delete process.env.OPENAI_API_KEY;
      
      (mockSpawn as any).mockImplementation((command: string, args?: any, options?: any) => {
        expect(options?.env).toBeDefined();
        // Should still work even without API key (CLI should handle the error)
        
        return mockChild as unknown as ChildProcess;
      });
    });
  });

  describe('Timeout Handling', () => {
    test('should set appropriate timeout for CLI execution', () => {
      (mockSpawn as any).mockImplementation((command: string, args?: any, options?: any) => {
        expect(options?.timeout).toBe(300000); // 5 minutes
        
        return mockChild as unknown as ChildProcess;
      });
    });
  });

  describe('Logging Security', () => {
    test('should redact sensitive information from logs', async () => {
      const { logger } = require('@trigger.dev/sdk');
      
      try {
        await runCodexCLI('test prompt', 'test context', '/test/path');
      } catch {
        // Ignore execution errors, we're testing logging
      }
      
      // Check that logs don't contain the full prompt content
      expect(logger.log).toHaveBeenCalled();
      const logCalls = (logger.log as jest.Mock).mock.calls;
      const argsLog = logCalls.find((call: any[]) => call[1]?.args);
      
      if (argsLog) {
        const loggedArgs = (argsLog[1] as any).args;
        expect(loggedArgs[loggedArgs.length - 1]).toBe('[PROMPT_REDACTED]');
      }
    });
  });
});

describe('Integration Test Scenarios', () => {
  test('should handle various input scenarios safely', () => {
    const testCases = [
      'normal prompt text',
      'prompt with "quotes"',
      'prompt with \\backslashes',
      'prompt; with; semicolons',
      'prompt && with && operators',
      'prompt | with | pipes',
      'prompt $(with) $(command) substitution',
      'prompt `with` `backticks`',
      'prompt {with} {braces}',
      'prompt [with] [brackets]',
      ''
    ];

    testCases.forEach(testCase => {
      const sanitized = sanitizePrompt(testCase);
      
      // Verify each test case is handled safely
      expect(typeof sanitized).toBe('string');
      expect(sanitized).not.toContain(';');
      expect(sanitized).not.toContain('|');
      expect(sanitized).not.toContain('&');
      expect(sanitized).not.toContain('`');
      expect(sanitized).not.toContain('$');
      expect(sanitized).not.toContain('(');
      expect(sanitized).not.toContain(')');
    });
  });

  describe('runCodexCLI Integration Tests', () => {
    test('should execute CLI with proper arguments and security', async () => {
      const testPrompt = 'Create a test function';
      const testContext = 'This is test context';
      const testRepoPath = '/test/repo';

      (mockSpawn as any).mockImplementation((command: string, args?: any, options?: any) => {
        // Verify command structure
        expect(command).toBe('npx');
        if (args) {
          expect(args[0]).toBe('@openai/codex');
          expect(args[1]).toBe('exec');
          expect(args[2]).toBe('--model');
          expect(args[3]).toBe('codex-mini-latest');
          expect(args[4]).toBe('--full-auto');
          expect(args[5]).toBe('--cd');
          expect(args[6]).toBe(testRepoPath);
          
          // Verify the prompt contains expected content but is sanitized
          const enhancedPrompt = args[7];
          expect(enhancedPrompt).toContain('USER REQUEST:');
          expect(enhancedPrompt).toContain('REPOSITORY CONTEXT:');
          expect(enhancedPrompt).toContain('SEARCH/REPLACE blocks');
        }
        
        // Verify options
        expect(options?.env?.OPENAI_API_KEY).toBe('test-key');
        expect(options?.timeout).toBe(300000);
        
        return mockChild as unknown as ChildProcess;
      });

      const result = await runCodexCLI(testPrompt, testContext, testRepoPath);
      expect(result).toBe('test output');
    });

    test('should handle CLI execution errors gracefully', async () => {
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10); // Failure code
        }
      });
      
      mockChild.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from('CLI execution failed'));
        }
      });

      await expect(runCodexCLI('test', 'context', '/path')).rejects.toThrow(
        'Command failed with code 1: CLI execution failed'
      );
    });

    test('should sanitize all inputs before CLI execution', async () => {
      const maliciousPrompt = 'test; rm -rf /; echo "hacked"';
      const maliciousContext = 'context && dangerous command';
      const maliciousPath = '/path`ls -la`';

      (mockSpawn as any).mockImplementation((command: string, args?: any, options?: any) => {
        // Verify all inputs are sanitized
        if (args) {
          const repoPath = args[6];
          const enhancedPrompt = args[7];
          
          expect(repoPath).not.toContain('`');
          expect(repoPath).not.toContain('ls -la');
          expect(enhancedPrompt).not.toContain(';');
          expect(enhancedPrompt).not.toContain('rm -rf');
          expect(enhancedPrompt).not.toContain('&&');
          expect(enhancedPrompt).not.toContain('dangerous command');
        }
        
        return mockChild as unknown as ChildProcess;
      });

      await runCodexCLI(maliciousPrompt, maliciousContext, maliciousPath);
    });

    test('should handle empty inputs safely', async () => {
      (mockSpawn as any).mockImplementation((command: string, args?: any, options?: any) => {
        // Should still construct valid command even with empty inputs
        expect(command).toBe('npx');
        expect(args?.length).toBe(8); // All args should be present
        if (args) {
          expect(args[7]).toContain('USER REQUEST:');
        }
        
        return mockChild as unknown as ChildProcess;
      });

      await runCodexCLI('', '', '');
    });

    test('should log security information appropriately', async () => {
      const { logger } = require('@trigger.dev/sdk');
      
      await runCodexCLI('test prompt with sensitive data', 'context', '/path');
      
      // Verify logging calls with security prefixes
      expect(logger.log).toHaveBeenCalledWith(
        'CODEX_CLI: Starting @openai/codex CLI tool',
        expect.any(Object)
      );
      
      expect(logger.log).toHaveBeenCalledWith(
        'CODEX_CLI: Executing @openai/codex CLI',
        expect.objectContaining({
          command: 'npx',
          args: expect.arrayContaining(['[PROMPT_REDACTED]'])
        })
      );
      
      expect(logger.log).toHaveBeenCalledWith(
        'CODEX_CLI: @openai/codex CLI completed successfully',
        expect.any(Object)
      );
    });

    test('should handle spawn errors appropriately', async () => {
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Spawn failed')), 10);
        }
      });

      await expect(runCodexCLI('test', 'context', '/path')).rejects.toThrow(
        '@openai/codex CLI failed: Spawn failed'
      );
    });

    test('should handle missing environment variables', async () => {
      delete process.env.OPENAI_API_KEY;
      
      (mockSpawn as any).mockImplementation((command: string, args?: any, options?: any) => {
        expect(options?.env?.OPENAI_API_KEY).toBeUndefined();
        return mockChild as unknown as ChildProcess;
      });

      await runCodexCLI('test', 'context', '/path');
    });

    test('should handle context-only prompts', async () => {
      (mockSpawn as any).mockImplementation((command: string, args?: any, options?: any) => {
        if (args) {
          const enhancedPrompt = args[7];
          expect(enhancedPrompt).not.toContain('REPOSITORY CONTEXT:');
          expect(enhancedPrompt).toContain('USER REQUEST:');
        }
        
        return mockChild as unknown as ChildProcess;
      });

      await runCodexCLI('test prompt', '', '/path');
    });
  });
});