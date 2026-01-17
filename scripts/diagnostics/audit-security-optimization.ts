#!/usr/bin/env node
/**
 * Production-Grade Security & Optimization Audit
 *
 * Comprehensive diagnostic script that audits:
 * - Security vulnerabilities
 * - Code quality issues
 * - Performance bottlenecks
 * - Production readiness
 * - Best practices compliance
 *
 * Usage:
 *   npm run diagnostic:security
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { execSync } from 'child_process';

interface AuditIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  file: string;
  line?: number;
  message: string;
  recommendation: string;
}

interface AuditResults {
  security: {
    issues: AuditIssue[];
    score: number;
  };
  codeQuality: {
    issues: AuditIssue[];
    score: number;
  };
  performance: {
    issues: AuditIssue[];
    score: number;
  };
  production: {
    issues: AuditIssue[];
    score: number;
  };
  dependencies: {
    vulnerabilities: {
      high: number;
      moderate: number;
      low: number;
    };
    auditOutput: string;
  };
}

const issues: AuditIssue[] = [];
const srcDir = join(process.cwd(), 'src');

/**
 * Recursively get all TypeScript files in src/
 */
function getAllTsFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);

  files.forEach((file) => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory() && !filePath.includes('__tests__') && !filePath.includes('node_modules')) {
      getAllTsFiles(filePath, fileList);
    } else if (extname(file) === '.ts' && !filePath.includes('__tests__')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Get line number for a regex match in file content
 */
function getLineNumber(content: string, matchIndex: number): number {
  return content.substring(0, matchIndex).split('\n').length;
}

/**
 * SECURITY AUDIT
 */
function auditSecurity(): void {
  console.log('🔒 Running security audit...');

  const files = getAllTsFiles(srcDir);

  files.forEach((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = filePath.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '');

    // 1. Check for hardcoded secrets/API keys
    const secretPatterns = [
      /(?:api[_-]?key|apikey|secret|password|token|auth[_-]?token)\s*[:=]\s*['"]([^'"]{10,})['"]/gi,
      /(?:sk_|pk_|xoxb-|xoxp-|ghp_|gho_)[a-zA-Z0-9]{20,}/g,
      /['"](?:password|secret|key|token)\s*[:=]\s*['"][^'"]+['"]/gi,
    ];

    secretPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Skip if it's in a comment or test
        const beforeMatch = content.substring(Math.max(0, match.index - 50), match.index);
        if (!beforeMatch.includes('//') && !beforeMatch.includes('*')) {
          const line = getLineNumber(content, match.index);
          issues.push({
            severity: 'CRITICAL',
            category: 'Security',
            file: relativePath,
            line,
            message: `Potential hardcoded secret detected: ${match[0].substring(0, 30)}...`,
            recommendation: 'Move all secrets to environment variables. Never commit secrets to code.',
          });
        }
      }
    });

    // 2. Check for SQL injection vulnerabilities (non-parameterized queries)
    const sqlPatterns = [
      /\$\{[^}]+\}\s*\+\s*['"`]/g, // Template literal concatenation in SQL
      /query\s*\(\s*['"`][^'"`]*\$\{/g, // SQL with template literals
    ];

    sqlPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const line = getLineNumber(content, match.index);
        const context = content.substring(Math.max(0, match.index - 100), Math.min(content.length, match.index + 100));
        // Check if it's using parameterized queries (has params array)
        if (!context.includes('params') && !context.includes('$1') && !context.includes('?')) {
          issues.push({
            severity: 'CRITICAL',
            category: 'Security',
            file: relativePath,
            line,
            message: 'Potential SQL injection vulnerability: non-parameterized query detected',
            recommendation: 'Use parameterized queries with placeholders ($1, $2, etc.) and pass values as parameters array.',
          });
        }
      }
    });

    // 3. Check for exposed internal endpoints or debug code
    if (content.includes('localhost:') || content.includes('127.0.0.1')) {
      const line = content.split('\n').findIndex((line) => line.includes('localhost:') || line.includes('127.0.0.1'));
      if (line >= 0 && !content.split('\n')[line].includes('//')) {
        issues.push({
          severity: 'MEDIUM',
          category: 'Security',
          file: relativePath,
          line: line + 1,
          message: 'Hardcoded localhost/127.0.0.1 detected',
          recommendation: 'Use environment variables for all endpoint URLs. Remove hardcoded localhost references.',
        });
      }
    }

    // 4. Check for sensitive data in logs
    const logPatterns = [
      new RegExp('(?:console\\.(?:log|error|warn)|logger\\.(?:info|error|warn))\\s*\\([^)]*(?:password|secret|token|api[_-]?key|apikey|auth[_-]?token)[^)]*\\)', 'gi'),
    ];

    logPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const line = getLineNumber(content, match.index);
        issues.push({
          severity: 'HIGH',
          category: 'Security',
          file: relativePath,
          line,
          message: 'Potential sensitive data in logs',
          recommendation: 'Never log passwords, secrets, tokens, or API keys. Sanitize all logged data.',
        });
      }
    });

    // 5. Check for XSS vulnerabilities in text processing
    if (content.includes('innerHTML') || content.includes('dangerouslySetInnerHTML')) {
      const line = content.split('\n').findIndex((line) => line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML'));
      if (line >= 0) {
        issues.push({
          severity: 'HIGH',
          category: 'Security',
          file: relativePath,
          line: line + 1,
          message: 'Potential XSS vulnerability: innerHTML usage detected',
          recommendation: 'Use textContent or properly sanitize HTML before using innerHTML. Consider using a sanitization library.',
        });
      }
    }

    // 6. Check for file upload security (if applicable)
    if (content.includes('upload') && (content.includes('multer') || content.includes('formidable'))) {
      const hasValidation = content.includes('fileFilter') || content.includes('validate') || content.includes('mime');
      if (!hasValidation) {
        const line = content.split('\n').findIndex((line) => line.includes('upload'));
        if (line >= 0) {
          issues.push({
            severity: 'HIGH',
            category: 'Security',
            file: relativePath,
            line: line + 1,
            message: 'File upload without validation detected',
            recommendation: 'Always validate file types, sizes, and names. Scan for malware. Store files outside web root.',
          });
        }
      }
    }
  }); // Close files.forEach

  // 7. Check for CORS configuration (if applicable)
  const hasCorsConfig = files.some((f) => {
    const content = readFileSync(f, 'utf-8');
    return content.includes('cors') || content.includes('CORS') || content.includes('Access-Control');
  });

  if (!hasCorsConfig) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Security',
      file: 'N/A',
      message: 'No CORS configuration found',
      recommendation: 'If serving API endpoints, configure CORS properly to restrict origins.',
    });
  }
}

/**
 * CODE QUALITY AUDIT
 */
function auditCodeQuality(): void {
  console.log('📝 Running code quality audit...');

  const files = getAllTsFiles(srcDir);

  files.forEach((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = filePath.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '');
    const lines = content.split('\n');

    // 1. Check for 'any' types
    const anyPattern = /:\s*any\b/g;
    let match;
    while ((match = anyPattern.exec(content)) !== null) {
      const line = getLineNumber(content, match.index);
      // Skip if it's in a comment
      if (!lines[line - 1].trim().startsWith('//')) {
        issues.push({
          severity: 'MEDIUM',
          category: 'Code Quality',
          file: relativePath,
          line,
          message: "Usage of 'any' type detected",
          recommendation: "Replace 'any' with proper TypeScript types. Use 'unknown' if type is truly unknown.",
        });
      }
    }

    // 2. Check for non-null assertions (!)
    const nonNullPattern = /[a-zA-Z_$][a-zA-Z0-9_$]*\s*!/g;
    let nonNullMatch;
    while ((nonNullMatch = nonNullPattern.exec(content)) !== null) {
      const line = getLineNumber(content, nonNullMatch.index);
      const lineContent = lines[line - 1];
      // Only flag if it's actually a non-null assertion (not just ! in a condition)
      if (lineContent.includes('!') && !lineContent.includes('!==') && !lineContent.includes('!=') && !lineContent.includes('if') && !lineContent.includes('while')) {
        issues.push({
          severity: 'LOW',
          category: 'Code Quality',
          file: relativePath,
          line,
          message: 'Non-null assertion operator (!) used',
          recommendation: 'Avoid non-null assertions. Use proper null checks or optional chaining (?.).',
        });
      }
    }

    // 3. Check for unused imports (basic check - look for import statements that might be unused)
    const importPattern = /^import\s+.*from\s+['"]([^'"]+)['"]/gm;
    const imports: Array<{ line: number; import: string }> = [];
    let importMatch;
    while ((importMatch = importPattern.exec(content)) !== null) {
      const line = getLineNumber(content, importMatch.index);
      imports.push({ line, import: importMatch[0] });
    }

    // 4. Check for 'var' usage
    const varPattern = /\bvar\s+/g;
    let varMatch;
    while ((varMatch = varPattern.exec(content)) !== null) {
      const line = getLineNumber(content, varMatch.index);
      issues.push({
        severity: 'LOW',
        category: 'Code Quality',
        file: relativePath,
        line,
        message: "Usage of 'var' detected",
        recommendation: "Use 'const' or 'let' instead of 'var'. Prefer 'const' for immutable values.",
      });
    }

    // 5. Check for floating promises (promises without await or .catch)
    // More precise pattern: only flag if promise-returning function is called without:
    // - Being assigned to a variable (const/let/var)
    // - Being awaited
    // - Being chained (.then/.catch/.finally)
    // - Being returned
    // - Being passed as argument to another function
    // - Being a method/function definition (async function/method declarations)
    // - Being a throw statement
    // - Being in a comment
    
    // Pattern matches function calls that start with: fetch, query, request, execute, process
    // Examples: executeQuery(...), fetchAccessToken(...), this.executeRequest(...)
    const promisePattern = /(?:this\.|\.)?(?:fetch|query|request|execute|process)[A-Z]?\w*\s*\(/g;
    let promiseMatch;
    while ((promiseMatch = promisePattern.exec(content)) !== null) {
      const line = getLineNumber(content, promiseMatch.index);
      const lineContent = lines[line - 1].trim();
      const matchIndex = promiseMatch.index;
      
      // EXCLUDE: Comment lines (lines starting with // or /* or *)
      if (/^\s*(\/\/|\/\*|\*)/.test(lineContent)) {
        continue;
      }
      
      // Get context: 100 chars before the match to check for assignment/await/return
      const contextStart = Math.max(0, matchIndex - 100);
      const contextBefore = content.substring(contextStart, matchIndex);
      const contextAfter = content.substring(matchIndex, Math.min(content.length, matchIndex + 50));
      
      // EXCLUDE: Method/function definitions
      // Check if this is an async function/method definition by looking at the line:
      // - async function name(...) { or async function name(...): Promise<...>
      // - async methodName(...) { or async methodName(...): Promise<...>
      // - private/public/protected async methodName(...) { or : Promise<...>
      // Pattern: async keyword, then identifier, then opening paren, then either { or : (type annotation)
      const isAsyncMethodDef = /async\s+\w+\s*\([^)]*\)\s*[:{=]/.test(lineContent) ||
        /^\s*(?:private|public|protected)?\s*async\s+\w+\s*\(/.test(lineContent);
      
      // Also check for regular function definitions that might contain our keywords
      // async function executeQuery(...) or function processQueue(...)
      const isFunctionDef = /(?:async\s+)?function\s+\w+\s*\(/.test(lineContent) ||
        /^\s*(?:private|public|protected)?\s*(?:async\s+)?\w+\s*\([^)]*\)\s*[:{=]/.test(lineContent);
      
      // EXCLUDE: Throw statements
      // Check if line contains "throw" before the function call
      const isThrowStatement = /\bthrow\s+/.test(contextBefore) || lineContent.includes('throw');
      
      // EXCLUDE: Void statements
      const isVoided = /\bvoid\s+/.test(contextBefore) || lineContent.startsWith('void ');
      
      // Exclude if promise is properly handled:
      // 1. Assigned to variable: const/let/var ... = functionName(...)
      const isAssigned = /(?:const|let|var)\s+\w+\s*=\s*[^=]*$/.test(contextBefore);
      
      // 2. Awaited: await functionName(...) or await someFunction(functionName(...))
      const isAwaited = /\bawait\s+/.test(contextBefore);
      
      // 3. Returned: return functionName(...) or return await functionName(...)
      const isReturned = /\breturn\s+/.test(contextBefore);
      
      // 4. Chained: functionName(...).then/catch/finally
      const isChained = /\.(?:then|catch|finally)\s*\(/.test(contextAfter);
      
      // 5. Passed as argument: someFunction(functionName(...))
      // Check if there's an opening paren before the match (not part of the function call itself)
      const parenBefore = contextBefore.lastIndexOf('(');
      const parenAfter = contextAfter.indexOf(')');
      // If there's a paren before and it's not too far, likely passed as argument
      const isPassedAsArg = parenBefore > contextBefore.length - 30 && parenAfter > 0;
      
      // 6. Part of a function call that's being awaited: await withTimeout(functionName(...))
      // Check if there's "await" followed by a function name and opening paren before our match
      const isInAwaitedCall = /\bawait\s+\w+\s*\(/.test(contextBefore);
      
      // Only flag if NONE of the exclusion conditions are true
      if (!isAsyncMethodDef && 
          !isFunctionDef && 
          !isThrowStatement && 
          !isVoided &&
          !isAssigned && 
          !isAwaited && 
          !isReturned && 
          !isChained && 
          !isPassedAsArg && 
          !isInAwaitedCall) {
        // Additional line-level check: make sure it's not on a line that's clearly handled
        if (!lineContent.includes('await') && 
            !lineContent.includes('.then') && 
            !lineContent.includes('.catch') &&
            !lineContent.includes('const ') &&
            !lineContent.includes('let ') &&
            !lineContent.includes('var ') &&
            !lineContent.includes('return ') &&
            !lineContent.includes('throw ') &&
            !lineContent.includes('void ') &&
            !lineContent.startsWith('//') &&
            !lineContent.startsWith('*') &&
            !lineContent.startsWith('/*')) {
          issues.push({
            severity: 'HIGH',
            category: 'Code Quality',
            file: relativePath,
            line,
            message: 'Potential floating promise detected',
            recommendation: 'Always await promises or handle with .then()/.catch(). Unhandled promise rejections can crash the application.',
          });
        }
      }
    }

    // 6. Check for synchronous operations that should be async
    const syncPatterns = [
      /readFileSync|writeFileSync|readdirSync|statSync|execSync/g,
    ];

    syncPatterns.forEach((pattern) => {
      let syncMatch;
      while ((syncMatch = pattern.exec(content)) !== null) {
        const line = getLineNumber(content, syncMatch.index);
        const lineContent = lines[line - 1];
        // Only flag if it's not in a try-catch or if it's in a hot path
        if (!lineContent.includes('try') && !lineContent.includes('catch')) {
          issues.push({
            severity: 'MEDIUM',
            category: 'Code Quality',
            file: relativePath,
            line,
            message: `Synchronous operation detected: ${syncMatch[0]}`,
            recommendation: 'Consider using async versions (readFile, writeFile, etc.) to avoid blocking the event loop.',
          });
        }
      }
    });

    // 7. Check for high cyclomatic complexity (simplified - count if/else/for/while)
    let complexity = 1; // Base complexity
    const complexityPatterns = [
      /\bif\s*\(/g,
      /\belse\s*if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bswitch\s*\(/g,
      /\bcatch\s*\(/g,
      /\?\s*.*\s*:/g, // Ternary operators
    ];

    complexityPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        complexity++;
      }
    });

    if (complexity > 15) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Code Quality',
        file: relativePath,
        message: `High cyclomatic complexity detected (${complexity})`,
        recommendation: 'Refactor into smaller functions. Aim for complexity < 10. Extract complex conditions into named functions.',
      });
    }

    // 8. Check for missing error handling in async functions
    const asyncFunctionPattern = /async\s+(?:function\s+\w+|const\s+\w+\s*=\s*async|\([^)]*\)\s*=>)/g;
    let asyncMatch;
    while ((asyncMatch = asyncFunctionPattern.exec(content)) !== null) {
      const startLine = getLineNumber(content, asyncMatch.index);
      // Find the function body and check for try-catch
      const functionStart = content.indexOf('{', asyncMatch.index);
      if (functionStart > 0) {
        const functionBody = content.substring(functionStart);
        const hasTryCatch = functionBody.includes('try') || functionBody.includes('.catch(');
        const hasThrows = functionBody.includes('throw');
        // If function has async operations but no error handling
        if ((functionBody.includes('await') || functionBody.includes('Promise')) && !hasTryCatch && !hasThrows) {
          issues.push({
            severity: 'MEDIUM',
            category: 'Code Quality',
            file: relativePath,
            line: startLine,
            message: 'Async function without error handling',
            recommendation: 'Wrap async operations in try-catch blocks or handle promise rejections with .catch().',
          });
        }
      }
    }
  }); // Close files.forEach

  // 9. Check TypeScript strict mode
  try {
    const tsconfig = readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf-8');
    const tsconfigJson = JSON.parse(tsconfig);
    if (!tsconfigJson.compilerOptions?.strict) {
      issues.push({
        severity: 'HIGH',
        category: 'Code Quality',
        file: 'tsconfig.json',
        message: 'TypeScript strict mode is not enabled',
        recommendation: 'Enable strict mode in tsconfig.json: "strict": true. This catches many potential bugs at compile time.',
      });
    }
  } catch {
    // tsconfig.json might not exist or be invalid
  }
}

/**
 * PERFORMANCE AUDIT
 */
function auditPerformance(): void {
  console.log('⚡ Running performance audit...');

  const files = getAllTsFiles(srcDir);

  files.forEach((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = filePath.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '');
    const lines = content.split('\n');

    // 1. Check for N+1 query patterns
    const queryInLoopPattern = /(?:for|while|forEach|map|filter)\s*\([^)]*\)\s*\{[^}]*\b(?:query|fetch|request)\s*\(/gs;
    let queryMatch;
    while ((queryMatch = queryInLoopPattern.exec(content)) !== null) {
      const line = getLineNumber(content, queryMatch.index);
      issues.push({
        severity: 'HIGH',
        category: 'Performance',
        file: relativePath,
        line,
        message: 'Potential N+1 query pattern detected (query inside loop)',
        recommendation: 'Batch queries or use JOINs to fetch related data in a single query. Consider using DataLoader pattern.',
      });
    }

    // 2. Check for JSON.parse/stringify in loops
    const jsonInLoopPattern = /(?:for|while|forEach|map|filter)\s*\([^)]*\)\s*\{[^}]*JSON\.(?:parse|stringify)/gs;
    let jsonMatch;
    while ((jsonMatch = jsonInLoopPattern.exec(content)) !== null) {
      const line = getLineNumber(content, jsonMatch.index);
      issues.push({
        severity: 'MEDIUM',
        category: 'Performance',
        file: relativePath,
        line,
        message: 'JSON.parse/stringify in loop detected',
        recommendation: 'Move JSON operations outside loops. Parse once, process many times.',
      });
    }

    // 3. Check for inefficient string concatenation in loops
    const concatInLoopPattern = /(?:for|while|forEach)\s*\([^)]*\)\s*\{[^}]*\+\s*=['"]/gs;
    let concatMatch;
    while ((concatMatch = concatInLoopPattern.exec(content)) !== null) {
      const line = getLineNumber(content, concatMatch.index);
      issues.push({
        severity: 'LOW',
        category: 'Performance',
        file: relativePath,
        line,
        message: 'String concatenation in loop detected',
        recommendation: 'Use array.join() or template literals for better performance with many concatenations.',
      });
    }

    // 4. Check for missing database indexes (heuristic - look for WHERE clauses without indexes)
    if (content.includes('WHERE') && content.includes('query')) {
      const wherePattern = /WHERE\s+(\w+)\s*=/g;
      let whereMatch;
      while ((whereMatch = wherePattern.exec(content)) !== null) {
        const column = whereMatch[1];
        // Check if there's a comment about index or if it's a primary key
        const context = content.substring(Math.max(0, whereMatch.index - 200), whereMatch.index + 200);
        if (!context.includes('PRIMARY KEY') && !context.includes('UNIQUE') && !context.includes('INDEX') && !context.includes('index')) {
          issues.push({
            severity: 'MEDIUM',
            category: 'Performance',
            file: relativePath,
            message: `Potential missing index on column: ${column}`,
            recommendation: `Add database index on ${column} if it's used frequently in WHERE clauses. Check migration files.`,
          });
        }
      }
    }

    // 5. Check for heavy operations in hot paths
    const heavyOpsPattern = /(?:setTimeout|setInterval|process\.nextTick)\s*\([^)]*\)/g;
    let heavyMatch;
    while ((heavyMatch = heavyOpsPattern.exec(content)) !== null) {
      const line = getLineNumber(content, heavyMatch.index);
      const lineContent = lines[line - 1];
      // Check if it's in a frequently called function
      if (lineContent.includes('async') || lineContent.includes('function')) {
        issues.push({
          severity: 'LOW',
          category: 'Performance',
          file: relativePath,
          line,
          message: 'Timer operation in potentially hot path',
          recommendation: 'Consider if this timer is necessary. Use debouncing/throttling for frequent operations.',
        });
      }
    }

    // 6. Check for unnecessary API calls
    const fetchPattern = /fetch\s*\(/g;
    let fetchCount = 0;
    let fetchMatch;
    while ((fetchMatch = fetchPattern.exec(content)) !== null) {
      fetchCount++;
    }

    if (fetchCount > 5) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Performance',
        file: relativePath,
        message: `Multiple fetch calls detected (${fetchCount})`,
        recommendation: 'Consider batching API calls or implementing caching to reduce network overhead.',
      });
    }

    // 7. Check for memory leaks (unclosed connections, event listeners)
    const connectionPattern = /(?:createConnection|connect|open)\s*\([^)]*\)/g;
    let connMatch;
    while ((connMatch = connectionPattern.exec(content)) !== null) {
      const line = getLineNumber(content, connMatch.index);
      const functionBody = content.substring(connMatch.index, Math.min(content.length, connMatch.index + 500));
      // Check if there's a corresponding close/cleanup
      if (!functionBody.includes('close') && !functionBody.includes('disconnect') && !functionBody.includes('cleanup')) {
        issues.push({
          severity: 'HIGH',
          category: 'Performance',
          file: relativePath,
          line,
          message: 'Potential resource leak: connection opened without cleanup',
          recommendation: 'Ensure all connections are properly closed in finally blocks or cleanup handlers.',
        });
      }
    }
  }); // Close files.forEach

  // 8. Check for missing database indexes in migrations
  try {
    const migrationFiles = getAllTsFiles(join(process.cwd(), 'migrations')).concat(
      getAllTsFiles(join(process.cwd(), 'scripts')).filter((f) => f.includes('migration'))
    );

    let hasIndexes = false;
    migrationFiles.forEach((file) => {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('CREATE INDEX') || content.includes('CREATE UNIQUE INDEX')) {
        hasIndexes = true;
      }
    });

    // Check processed_tickets table specifically
    const processedTicketsIndex = migrationFiles.some((file) => {
      const content = readFileSync(file, 'utf-8');
      return content.includes('processed_tickets') && (content.includes('CREATE INDEX') || content.includes('UNIQUE'));
    });

    if (!processedTicketsIndex) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Performance',
        file: 'migrations/',
        message: 'Missing index on processed_tickets.ticket_id (if frequently queried)',
        recommendation: 'Add index on ticket_id if it\'s used in WHERE clauses: CREATE INDEX idx_processed_tickets_ticket_id ON processed_tickets(ticket_id);',
      });
    }
  } catch {
    // Migrations might not exist
  }
}

/**
 * PRODUCTION READINESS AUDIT
 */
function auditProductionReadiness(): void {
  console.log('🚀 Running production readiness audit...');

  const files = getAllTsFiles(srcDir);

  // 1. Check for error handling coverage
  let totalFunctions = 0;
  let functionsWithErrorHandling = 0;

  files.forEach((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    const asyncFunctionPattern = /async\s+(?:function|\w+\s*=|\([^)]*\)\s*=>)/g;
    let asyncMatch;
    while ((asyncMatch = asyncFunctionPattern.exec(content)) !== null) {
      totalFunctions++;
      const functionStart = content.indexOf('{', asyncMatch.index);
      if (functionStart > 0) {
        const functionBody = content.substring(functionStart, functionStart + 1000);
        if (functionBody.includes('try') || functionBody.includes('.catch(')) {
          functionsWithErrorHandling++;
        }
      }
    }
  });

  const errorHandlingCoverage = totalFunctions > 0 ? (functionsWithErrorHandling / totalFunctions) * 100 : 100;
  if (errorHandlingCoverage < 80) {
    issues.push({
      severity: 'HIGH',
      category: 'Production Readiness',
      file: 'N/A',
      message: `Low error handling coverage: ${errorHandlingCoverage.toFixed(1)}%`,
      recommendation: 'Add try-catch blocks or promise error handling to all async functions. Aim for 100% coverage.',
    });
  }

  // 2. Check for logging completeness
  const hasLogger = files.some((f) => {
    const content = readFileSync(f, 'utf-8');
    return content.includes('logger') || content.includes('console.log');
  });

  if (!hasLogger) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Production Readiness',
      file: 'N/A',
      message: 'No structured logging found',
      recommendation: 'Implement structured logging (e.g., Winston, Pino) for production observability.',
    });
  }

  // 3. Check for health check endpoints
  const handlers = getAllTsFiles(join(srcDir, 'handlers'));
  const hasHealthCheck = handlers.some((f) => {
    const content = readFileSync(f, 'utf-8');
    return content.includes('health') || content.includes('status');
  });

  if (!hasHealthCheck) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Production Readiness',
      file: 'handlers/',
      message: 'No health check endpoint found',
      recommendation: 'Add a /health or /status endpoint for monitoring and load balancer health checks.',
    });
  }

  // 4. Check for graceful shutdown handling
  const hasGracefulShutdown = files.some((f) => {
    const content = readFileSync(f, 'utf-8');
    return content.includes('SIGTERM') || content.includes('SIGINT') || content.includes('graceful') || content.includes('shutdown');
  });

  if (!hasGracefulShutdown) {
    issues.push({
      severity: 'MEDIUM',
      category: 'Production Readiness',
      file: 'N/A',
      message: 'No graceful shutdown handling found',
      recommendation: 'Implement graceful shutdown handlers for SIGTERM/SIGINT to close connections and finish in-flight requests.',
    });
  }

  // 5. Check configuration management
  const hasEnvValidation = files.some((f) => {
    const content = readFileSync(f, 'utf-8');
    return content.includes('zod') && content.includes('env') || content.includes('dotenv') && content.includes('validate');
  });

  if (!hasEnvValidation) {
    issues.push({
      severity: 'HIGH',
      category: 'Production Readiness',
      file: 'config/',
      message: 'No environment variable validation found',
      recommendation: 'Validate all environment variables at startup using Zod or similar. Fail fast if required vars are missing.',
    });
  }

  // 6. Check for resource limits
  const hasResourceLimits = files.some((f) => {
    const content = readFileSync(f, 'utf-8');
    return content.includes('max') && (content.includes('connection') || content.includes('pool') || content.includes('limit'));
  });

  if (!hasResourceLimits) {
    issues.push({
      severity: 'LOW',
      category: 'Production Readiness',
      file: 'N/A',
      message: 'No explicit resource limits configured',
      recommendation: 'Set limits on connection pools, request timeouts, and memory usage to prevent resource exhaustion.',
    });
  }
}

/**
 * Check dependency vulnerabilities
 */
function auditDependencies(): { high: number; moderate: number; low: number; auditOutput: string } {
  console.log('📦 Checking dependency vulnerabilities...');

  try {
    const auditOutput = execSync('npm audit --json', { encoding: 'utf-8', cwd: process.cwd() });
    const audit = JSON.parse(auditOutput);

    let high = 0;
    let moderate = 0;
    let low = 0;

    if (audit.vulnerabilities) {
      Object.values(audit.vulnerabilities).forEach((vuln: any) => {
        if (vuln.severity === 'high' || vuln.severity === 'critical') {
          high++;
        } else if (vuln.severity === 'moderate') {
          moderate++;
        } else if (vuln.severity === 'low') {
          low++;
        }
      });
    }

    return { high, moderate, low, auditOutput: auditOutput.substring(0, 500) };
  } catch (error: any) {
    // npm audit might fail, try without --json
    try {
      const auditOutput = execSync('npm audit', { encoding: 'utf-8', cwd: process.cwd() });
      return { high: 0, moderate: 0, low: 0, auditOutput: auditOutput.substring(0, 500) };
    } catch {
      return { high: 0, moderate: 0, low: 0, auditOutput: 'npm audit failed to run' };
    }
  }
}

/**
 * Calculate scores
 */
function calculateScores(results: AuditResults): void {
  // Security score (0-10)
  const securityIssues = results.security.issues;
  const criticalSecurity = securityIssues.filter((i) => i.severity === 'CRITICAL').length;
  const highSecurity = securityIssues.filter((i) => i.severity === 'HIGH').length;
  const mediumSecurity = securityIssues.filter((i) => i.severity === 'MEDIUM').length;

  results.security.score = Math.max(
    0,
    10 - criticalSecurity * 3 - highSecurity * 1.5 - mediumSecurity * 0.5
  );

  // Code quality score (0-10)
  const codeIssues = results.codeQuality.issues;
  const highCode = codeIssues.filter((i) => i.severity === 'HIGH').length;
  const mediumCode = codeIssues.filter((i) => i.severity === 'MEDIUM').length;
  const lowCode = codeIssues.filter((i) => i.severity === 'LOW').length;

  results.codeQuality.score = Math.max(
    0,
    10 - highCode * 1.5 - mediumCode * 0.5 - lowCode * 0.2
  );

  // Performance score (0-10)
  const perfIssues = results.performance.issues;
  const highPerf = perfIssues.filter((i) => i.severity === 'HIGH').length;
  const mediumPerf = perfIssues.filter((i) => i.severity === 'MEDIUM').length;

  results.performance.score = Math.max(
    0,
    10 - highPerf * 2 - mediumPerf * 0.5
  );

  // Production readiness score (0-10)
  const prodIssues = results.production.issues;
  const highProd = prodIssues.filter((i) => i.severity === 'HIGH').length;
  const mediumProd = prodIssues.filter((i) => i.severity === 'MEDIUM').length;

  results.production.score = Math.max(
    0,
    10 - highProd * 2 - mediumProd * 0.5
  );
}

/**
 * Print results
 */
function printResults(results: AuditResults): void {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔒 SECURITY & OPTIMIZATION AUDIT');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Security
  console.log('SECURITY AUDIT');
  const securityIssues = results.security.issues;
  if (securityIssues.length === 0) {
    console.log('✓ No security issues found\n');
  } else {
    securityIssues.forEach((issue) => {
      const icon = issue.severity === 'CRITICAL' ? '🚨' : issue.severity === 'HIGH' ? '⚠️' : 'ℹ️';
      console.log(`${icon} ${issue.severity}: ${issue.message}`);
      console.log(`   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.recommendation}\n`);
    });
  }
  console.log(`Security Score: ${results.security.score.toFixed(1)}/10\n`);

  // Code Quality
  console.log('CODE QUALITY');
  const codeIssues = results.codeQuality.issues;
  if (codeIssues.length === 0) {
    console.log('✓ No code quality issues found\n');
  } else {
    codeIssues.forEach((issue) => {
      const icon = issue.severity === 'HIGH' ? '⚠️' : 'ℹ️';
      console.log(`${icon} ${issue.severity}: ${issue.message}`);
      console.log(`   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.recommendation}\n`);
    });
  }
  console.log(`Code Quality Score: ${results.codeQuality.score.toFixed(1)}/10\n`);

  // Performance
  console.log('PERFORMANCE');
  const perfIssues = results.performance.issues;
  if (perfIssues.length === 0) {
    console.log('✓ No performance issues found\n');
  } else {
    perfIssues.forEach((issue) => {
      const icon = issue.severity === 'HIGH' ? '⚠️' : 'ℹ️';
      console.log(`${icon} ${issue.severity}: ${issue.message}`);
      console.log(`   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.recommendation}\n`);
    });
  }
  console.log(`Performance Score: ${results.performance.score.toFixed(1)}/10\n`);

  // Production Readiness
  console.log('PRODUCTION READINESS');
  const prodIssues = results.production.issues;
  if (prodIssues.length === 0) {
    console.log('✓ No production readiness issues found\n');
  } else {
    prodIssues.forEach((issue) => {
      const icon = issue.severity === 'HIGH' ? '⚠️' : 'ℹ️';
      console.log(`${icon} ${issue.severity}: ${issue.message}`);
      console.log(`   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.recommendation}\n`);
    });
  }
  console.log(`Production Score: ${results.production.score.toFixed(1)}/10\n`);

  // Dependencies
  console.log('DEPENDENCY VULNERABILITIES');
  const vulns = results.dependencies.vulnerabilities || { high: 0, moderate: 0, low: 0 };
  console.log(`Vulnerabilities: ${vulns.high} high, ${vulns.moderate} moderate, ${vulns.low} low\n`);

  // Overall scores
  const overall = (
    results.security.score * 0.3 +
    results.codeQuality.score * 0.2 +
    results.performance.score * 0.2 +
    results.production.score * 0.3
  );

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 OVERALL SCORES');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Security: ${results.security.score.toFixed(1)}/10`);
  console.log(`Code Quality: ${results.codeQuality.score.toFixed(1)}/10`);
  console.log(`Performance: ${results.performance.score.toFixed(1)}/10`);
  console.log(`Production: ${results.production.score.toFixed(1)}/10`);
  console.log(`\nOverall: ${overall.toFixed(1)}/10 (weighted average)\n`);

  // Critical issues
  const criticalIssues = [
    ...results.security.issues.filter((i) => i.severity === 'CRITICAL'),
    ...results.codeQuality.issues.filter((i) => i.severity === 'CRITICAL'),
    ...results.performance.issues.filter((i) => i.severity === 'CRITICAL'),
    ...results.production.issues.filter((i) => i.severity === 'CRITICAL'),
  ];

  if (criticalIssues.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🚨 CRITICAL ISSUES (Fix Immediately)');
    console.log('═══════════════════════════════════════════════════════════\n');
    criticalIssues.forEach((issue) => {
      console.log(`🚨 ${issue.message}`);
      console.log(`   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.recommendation}\n`);
    });
  }

  // High priority
  const highIssues = [
    ...results.security.issues.filter((i) => i.severity === 'HIGH'),
    ...results.codeQuality.issues.filter((i) => i.severity === 'HIGH'),
    ...results.performance.issues.filter((i) => i.severity === 'HIGH'),
    ...results.production.issues.filter((i) => i.severity === 'HIGH'),
  ];

  if (highIssues.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('⚠️ HIGH PRIORITY IMPROVEMENTS');
    console.log('═══════════════════════════════════════════════════════════\n');
    highIssues.forEach((issue) => {
      console.log(`⚠️ ${issue.message}`);
      console.log(`   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.recommendation}\n`);
    });
  }

  // Medium/Low
  const mediumLowIssues = [
    ...results.security.issues.filter((i) => i.severity === 'MEDIUM' || i.severity === 'LOW'),
    ...results.codeQuality.issues.filter((i) => i.severity === 'MEDIUM' || i.severity === 'LOW'),
    ...results.performance.issues.filter((i) => i.severity === 'MEDIUM' || i.severity === 'LOW'),
    ...results.production.issues.filter((i) => i.severity === 'MEDIUM' || i.severity === 'LOW'),
  ];

  if (mediumLowIssues.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('💡 OPTIMIZATION OPPORTUNITIES');
    console.log('═══════════════════════════════════════════════════════════\n');
    mediumLowIssues.slice(0, 10).forEach((issue) => {
      console.log(`💡 ${issue.severity}: ${issue.message}`);
      console.log(`   File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
      console.log(`   ${issue.recommendation}\n`);
    });
    if (mediumLowIssues.length > 10) {
      console.log(`... and ${mediumLowIssues.length - 10} more optimization opportunities\n`);
    }
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔒 PRODUCTION-GRADE SECURITY & OPTIMIZATION AUDIT');
  console.log('═══════════════════════════════════════════════════════════\n');

  const results: AuditResults = {
    security: { issues: [], score: 0 },
    codeQuality: { issues: [], score: 0 },
    performance: { issues: [], score: 0 },
    production: { issues: [], score: 0 },
    dependencies: { high: 0, moderate: 0, low: 0, auditOutput: '' },
  };

  // Run audits
  auditSecurity();
  auditCodeQuality();
  auditPerformance();
  auditProductionReadiness();

  // Categorize issues
  issues.forEach((issue) => {
    if (issue.category === 'Security') {
      results.security.issues.push(issue);
    } else if (issue.category === 'Code Quality') {
      results.codeQuality.issues.push(issue);
    } else if (issue.category === 'Performance') {
      results.performance.issues.push(issue);
    } else if (issue.category === 'Production Readiness') {
      results.production.issues.push(issue);
    }
  });

  // Check dependencies
  results.dependencies = auditDependencies();

  // Calculate scores
  calculateScores(results);

  // Print results
  printResults(results);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
