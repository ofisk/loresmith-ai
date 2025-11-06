# Contributing to LoreSmith AI

Thank you for your interest in contributing to LoreSmith AI! This document provides guidelines and standards for contributing to the project.

## Table of Contents

- [Code Standards](#code-standards)
- [Import Conventions](#import-conventions)
- [Service Architecture](#service-architecture)
- [Type Safety](#type-safety)
- [Component Organization](#component-organization)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)
- [Development Workflow](#development-workflow)

## Code Standards

### General Principles

1. **Type Safety**: Always use proper TypeScript types. Avoid `any` - use `unknown` when the type is truly unknown.
2. **Single Responsibility**: Each file should have a single, well-defined responsibility.
3. **Consistency**: Follow existing patterns and conventions in the codebase.
4. **Documentation**: Add clear comments for complex logic, but avoid obvious comments.

### Import Conventions

**Always use the `@/` alias for imports from `src/`:**

```typescript
// ✅ Good
import { AuthService } from "@/services/core/auth-service";
import type { Campaign } from "@/types/campaign";
import { API_CONFIG } from "@/shared-config";

// ❌ Bad
import { AuthService } from "../../services/core/auth-service";
import { Campaign } from "../types/campaign";
```

**Exception**: Component-to-component imports within the same directory can use relative imports (`./`), but prefer `@/` for consistency.

## Service Architecture

### Service Organization

Services are organized into logical subdirectories:

- `src/services/core/` - Core application services (auth, assessment, library, metadata, progress)
- `src/services/campaign/` - Campaign-related services
- `src/services/file/` - File processing and upload services
- `src/services/rag/` - RAG (Retrieval-Augmented Generation) services

### Service Naming

**All service files must use the `-service.ts` suffix:**

```typescript
// ✅ Good
src / services / core / auth - service.ts;
src / services / file / job - status - service.ts;
src / services / campaign / campaign - autorag - service.ts;

// ❌ Bad
src / services / auth.ts;
src / services / jobStatus.ts;
src / services / campaign - autorag - client.ts;
```

### Service Patterns

Services should:

- Export a class or set of functions
- Use dependency injection via the `Env` interface
- Be cached via `ServiceFactory` when appropriate
- Handle errors gracefully with proper logging

## Type Safety

### Avoid `any` Types

Always prefer specific types or `unknown`:

```typescript
// ✅ Good
interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  [key: string]: unknown; // Use unknown, not any
}

// ❌ Bad
interface ApiResponse {
  [key: string]: any;
}
```

### Use Type Guards

When working with `unknown` types, use type guards:

```typescript
// ✅ Good
if (
  data &&
  typeof data === "object" &&
  "campaignId" in data &&
  typeof data.campaignId === "string"
) {
  const campaignId = data.campaignId;
  // Use campaignId safely
}

// ❌ Bad
const campaignId = data.campaignId; // TypeScript error
```

### Environment Types

Always extend the `Env` interface from `@/middleware/auth` for route handlers:

```typescript
// ✅ Good
import type { Env } from "@/middleware/auth";

export async function handleRoute(c: Context<{ Bindings: Env }>) {
  // Use c.env properties
}
```

## Component Organization

### Component Structure

- **Small, Focused Components**: Components should be under 300 lines when possible
- **Separation of Concerns**: Extract UI logic into separate hooks
- **Reusable Components**: Place reusable components in appropriate directories

### Component Naming

- Use PascalCase for component files: `ResourceList.tsx`
- Use descriptive names that indicate purpose
- Group related components in subdirectories

### Large Component Refactoring

If a component exceeds 500 lines, consider:

1. **Extract Sub-components**: Break into smaller, focused components
2. **Extract Custom Hooks**: Move complex state logic to hooks
3. **Extract Utilities**: Move helper functions to utility files

**Example**: `app.tsx` was refactored by extracting:

- `AppHeader` - Header UI
- `ChatArea` - Chat interface
- `AppModals` - Modal management

## Testing Guidelines

### Test Organization

- Unit tests: `tests/services/`, `tests/hooks/`, etc.
- Integration tests: `tests/integration/`
- Test files: `*.test.ts` or `*.test.tsx`

### Test Requirements

- Write tests for critical paths and edge cases
- Test error handling and validation
- Use Vitest with `@cloudflare/vitest-pool-workers` for Workers environment
- Mock external dependencies appropriately

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

## Commit Messages

### Format

Keep commit messages concise (5 lines or less):

```
refactor: Standardize imports to use @/ alias

- Updated all hooks to use @/ alias imports
- Standardized routes imports to use @/ alias
- Fixed middleware and lib file imports
```

### Type Prefixes

- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring
- `docs:` - Documentation changes
- `test:` - Test additions/modifications
- `chore:` - Maintenance tasks

## Development Workflow

### Before Starting

1. **Check existing issues**: Look for related issues or discussions
2. **Plan your changes**: Consider the impact on existing code
3. **Follow the architecture**: Understand the service organization and patterns

### Making Changes

1. **Create a branch**: `git checkout -b feature/your-feature-name`
2. **Make incremental changes**: Small, focused commits
3. **Follow linting rules**: Run `npm run check` before committing
4. **Write tests**: Add tests for new functionality
5. **Update documentation**: Update relevant docs if needed

### Code Review Checklist

- [ ] Imports use `@/` alias
- [ ] No `any` types (use `unknown` if needed)
- [ ] Services follow naming convention (`-service.ts`)
- [ ] Components are appropriately sized
- [ ] Tests added for new functionality
- [ ] Documentation updated if needed
- [ ] Linting passes (`npm run check`)

### Pull Request Process

1. **Update branch**: Rebase on latest `main` branch
2. **Write clear description**: Explain what and why
3. **Link related issues**: Reference any related issues
4. **Request review**: Tag relevant maintainers
5. **Address feedback**: Respond to review comments promptly

## File Organization

### Directory Structure

```
src/
├── agents/          # AI agent implementations
├── components/      # React components
│   ├── app/         # App-level components
│   ├── auth/        # Authentication components
│   ├── chat/        # Chat-related components
│   └── ...
├── constants/       # Application constants
├── dao/             # Data Access Objects
├── durable-objects/ # Cloudflare Durable Objects
├── hooks/           # React hooks
├── lib/             # Shared libraries and utilities
├── middleware/      # Request middleware
├── routes/          # API route handlers
├── services/        # Business logic services
│   ├── core/        # Core services
│   ├── campaign/    # Campaign services
│   ├── file/        # File services
│   └── rag/         # RAG services
├── tools/           # AI agent tools
├── types/           # TypeScript type definitions
└── utils/           # Utility functions
```

### File Naming

- **Services**: `*-service.ts`
- **Components**: `PascalCase.tsx`
- **Hooks**: `use*.ts` or `use*.tsx`
- **Types**: `*.ts` (type definitions)
- **Utils**: `kebab-case.ts`
- **Routes**: `kebab-case.ts`

## Logging

Use the centralized logger utility:

```typescript
import { logger } from "@/lib/logger";

const log = logger.scope("[ComponentName]");

log.debug("Debug message", { data });
log.info("Info message");
log.warn("Warning message");
log.error("Error message", error);
```

**Avoid**: Direct `console.log` calls - use the logger instead.

## Error Handling

### API Routes

```typescript
export async function handleRoute(c: Context<{ Bindings: Env }>) {
  try {
    // Route logic
    return c.json({ success: true, data });
  } catch (error) {
    log.error("Route error", error);
    return c.json({ error: "Operation failed" }, 500);
  }
}
```

### Service Methods

```typescript
async method(): Promise<Result> {
  try {
    // Service logic
    return result;
  } catch (error) {
    log.error("Service error", error);
    throw new Error("Descriptive error message");
  }
}
```

## Questions?

If you have questions about contributing:

1. Check existing documentation in `docs/`
2. Review similar code in the codebase
3. Open a discussion issue
4. Ask in pull request comments

Thank you for contributing to LoreSmith AI!
