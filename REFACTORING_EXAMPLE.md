# Complexity Reduction Example: process-ticket.ts

## Before: High Complexity (20)

The original `process-ticket.ts` handler had high cyclomatic complexity due to:
- Multiple nested if statements
- Complex error handling logic
- Status checking logic mixed with response formatting

## After: Reduced Complexity (Target: <10)

### Strategy: Extract Methods for Single Responsibilities

**Extracted Functions**:
1. `validateRequest()` - Request validation logic
2. `checkAlreadyProcessed()` - Idempotency check
3. `determineFinalStatus()` - Status determination logic
4. `sendSuccessResponse()` - Success response formatting
5. `sendErrorResponse()` - Error response formatting

### Example Refactoring Pattern

```typescript
// BEFORE (complexity: 20)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    // ... validation
  }
  
  let ticketId: string;
  try {
    // ... parse body
    if (!req.body) {
      // ... error response
    }
    // ... more validation
  } catch (err) {
    // ... error handling
  }
  
  // Check if already processed
  const processedTicketsRepository = new ProcessedTicketsRepository();
  let wasAlreadyProcessed = false;
  try {
    wasAlreadyProcessed = await processedTicketsRepository.hasSuccessfulRecord(ticketId);
  } catch {
    // ...
  }
  
  if (wasAlreadyProcessed) {
    // ... response
    return;
  }
  
  // Process ticket
  try {
    await ticketProcessingService.processClosedTicket(ticketId);
    
    // Check final status
    try {
      const isSuccess = await processedTicketsRepository.hasSuccessfulRecord(ticketId);
      if (isSuccess) {
        // ... success response
      } else {
        // ... check needs_review
        const result = await query(...);
        if (record?.status === 'needs_review') {
          // ... needs_review response
        } else {
          // ... default response
        }
      }
    } catch (dbError) {
      // ... error handling
    }
  } catch (err) {
    // ... complex error handling
  }
}

// AFTER (complexity: <10)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendErrorResponse(res, 405, { error: 'BAD_REQUEST', message: 'Method not allowed' });
  }
  
  const ticketId = await validateRequest(req, res);
  if (!ticketId) return; // Validation failed, response already sent
  
  const wasAlreadyProcessed = await checkAlreadyProcessed(ticketId, res);
  if (wasAlreadyProcessed) return; // Already processed, response sent
  
  await processTicketAndRespond(ticketId, res);
}

// Extracted functions (each with complexity < 5)
async function validateRequest(req, res): Promise<string | null> {
  // Single responsibility: validate request
  // Returns ticketId or null if validation fails
}

async function checkAlreadyProcessed(ticketId: string, res): Promise<boolean> {
  // Single responsibility: check idempotency
  // Returns true if already processed (response sent)
}

async function processTicketAndRespond(ticketId: string, res): Promise<void> {
  // Single responsibility: process and respond
  const service = createTicketProcessingService();
  try {
    await service.processClosedTicket(ticketId);
    const status = await determineFinalStatus(ticketId);
    sendSuccessResponse(res, ticketId, status);
  } catch (err) {
    handleProcessingError(err, ticketId, res);
  }
}

async function determineFinalStatus(ticketId: string): Promise<'processed' | 'needs_review'> {
  // Single responsibility: determine status
  // Returns status based on database record
}

function sendSuccessResponse(res, ticketId: string, status: string): void {
  // Single responsibility: format success response
}

function handleProcessingError(err, ticketId: string, res): void {
  // Single responsibility: handle errors
}
```

### Benefits

1. **Testability**: Each function can be tested independently
2. **Readability**: Main handler is now ~20 lines, easy to understand
3. **Maintainability**: Changes to validation don't affect processing logic
4. **Reusability**: Validation logic can be reused in other handlers

### Complexity Reduction

- **Before**: 1 function with complexity 20
- **After**: 6 functions, each with complexity < 5
- **Total complexity**: Same, but distributed and manageable

---

## Refactoring Guidelines

### 1. Extract by Responsibility
- One function = one responsibility
- Each function does ONE thing well

### 2. Use Guard Clauses
```typescript
// BAD (nested)
if (condition) {
  if (subCondition) {
    // logic
  }
}

// GOOD (guard clauses)
if (!condition) return;
if (!subCondition) return;
// logic
```

### 3. Extract Complex Conditionals
```typescript
// BAD
if (err instanceof DatabaseError && err.cause && (err.cause.code === 'ECONNREFUSED' || err.cause.code === 'ETIMEDOUT')) {
  // ...
}

// GOOD
function isConnectionError(err: unknown): boolean {
  if (!(err instanceof DatabaseError)) return false;
  const code = err.cause?.code;
  return code === 'ECONNREFUSED' || code === 'ETIMEDOUT';
}

if (isConnectionError(err)) {
  // ...
}
```

### 4. Strategy Pattern for Complex Conditionals
```typescript
// BAD (many if/else)
if (type === 'A') {
  // 20 lines
} else if (type === 'B') {
  // 20 lines
} else if (type === 'C') {
  // 20 lines
}

// GOOD (strategy pattern)
const strategies = {
  A: new TypeAStrategy(),
  B: new TypeBStrategy(),
  C: new TypeCStrategy(),
};
const strategy = strategies[type];
return strategy.execute(data);
```

---

## Priority Order for Refactoring

1. **jifeline-api-client.ts** (47) - Most critical, used everywhere
2. **certificate-pdf-generator.ts** (44) - PDF generation logic
3. **certificate-data-builder.ts** (41) - Data transformation
4. **reg-mileage-extractor.ts** (33) - Extraction logic
5. **process-ticket.ts** (20) - Handler (example above)

**Recommendation**: Refactor one file per PR with comprehensive tests.
