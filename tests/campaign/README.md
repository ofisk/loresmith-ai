# Campaign Workflows Test Suite

This directory contains comprehensive unit tests for the campaign management functionality in the LoreSmith AI application. The tests follow Test-Driven Development (TDD) principles and cover all aspects of campaign workflows.

## Test Structure

### `testUtils.ts`

Contains shared test utilities and mock functions:

- `createMockCampaign()` - Creates mock campaign data for testing
- `createMockResource()` - Creates mock resource data for testing
- `createCampaignManagerStub()` - Creates mock Durable Object stubs
- `createCampaignsKVStub()` - Creates mock KV storage stubs
- `createTestEnv()` - Creates test environment with mocked dependencies

### `api.test.ts`

Tests for API endpoints and HTTP request handling:

- **Campaign Indexing**: Tests for triggering RAG indexing on campaigns
- **Campaign CRUD**: Create, read, update, delete operations
- **Resource Management**: Adding and removing resources from campaigns
- **Error Handling**: Validation errors, not found scenarios, server errors
- **Response Validation**: Ensures correct HTTP status codes and response formats

### `hooks.test.ts`

Tests for React hooks and data fetching logic:

- **useCampaigns**: Campaign listing and state management
- **useCampaignDetail**: Individual campaign data fetching
- **useCampaignActions**: Campaign creation, resource management actions
- **Error Handling**: Network errors, API failures, validation errors
- **Data Transformation**: Response parsing and state updates

### `tools.test.ts`

Tests for AI tool definitions and executions:

- **Tool Definitions**: Validates tool schemas and parameters
- **Tool Executions**: Tests for confirmation-required tool logic
- **Parameter Validation**: Resource types, campaign IDs, required fields
- **Data Structures**: Campaign and resource type validation
- **Mock Executions**: Simulates AI tool execution scenarios

### `durable-objects.test.ts`

Tests for Durable Object and KV storage operations:

- **CampaignManager**: Durable Object lifecycle and state management
- **KV Operations**: Storage, retrieval, listing, and deletion
- **Resource Management**: Adding/removing resources from campaigns
- **Indexing**: RAG indexing trigger and status tracking
- **Data Validation**: Campaign and resource data structure validation

## Test Coverage

### API Endpoints Tested

- `POST /campaign/:id/index` - Trigger campaign indexing
- `GET /campaigns` - List all campaigns
- `POST /campaigns` - Create new campaign
- `GET /campaigns/:id` - Get campaign details
- `POST /campaigns/:id/resource` - Add resource to campaign
- `DELETE /campaigns/:id` - Delete campaign
- `DELETE /campaigns/:id/resource/:resourceId` - Remove resource from campaign

### Data Types Tested

- **CampaignData**: Campaign structure validation
- **CampaignResource**: Resource structure validation
- **ResourceType**: PDF, character, note, image types
- **API Requests/Responses**: Request/response format validation

### Error Scenarios Tested

- Missing required parameters
- Invalid resource types
- Campaign not found
- Resource not found in campaign
- KV storage failures
- Network errors
- Validation errors

## Running Tests

```bash
# Run all campaign tests
npm test tests/campaign/

# Run specific test file
npm test tests/campaign/api.test.ts

# Run tests with coverage
npm test tests/campaign/ --coverage
```

## Test-Driven Development Approach

These tests are designed to drive the implementation of campaign features:

1. **Red Phase**: Tests are written first and fail (expected)
2. **Green Phase**: Minimal implementation to make tests pass
3. **Refactor Phase**: Improve implementation while keeping tests green

### Key Testing Principles

- **Isolation**: Each test is independent and doesn't rely on other tests
- **Mocking**: External dependencies are mocked to ensure test reliability
- **Edge Cases**: Tests cover both happy path and error scenarios
- **Data Validation**: Tests ensure data structures are correct
- **API Contracts**: Tests validate request/response formats

## Mock Strategy

### Durable Objects

- `CampaignManager` is mocked to simulate campaign operations
- KV storage operations are mocked to avoid external dependencies
- Authentication is bypassed for testing simplicity

### API Calls

- `fetch` is mocked to simulate HTTP requests
- Response formats match expected API contracts
- Error scenarios are simulated with appropriate HTTP status codes

### React Hooks

- Hook logic is tested through direct function calls
- State management is validated through return values
- Error handling is tested through mock failures

## Future Enhancements

### Integration Tests

- End-to-end testing with real Durable Objects
- Full API integration testing
- Database integration testing

### Performance Tests

- Large campaign data handling
- Concurrent resource operations
- Indexing performance benchmarks

### Security Tests

- Authentication and authorization
- Input validation and sanitization
- Rate limiting and abuse prevention

## Contributing

When adding new campaign features:

1. Write tests first following TDD principles
2. Ensure all existing tests continue to pass
3. Add appropriate error handling tests
4. Update this README with new test coverage
5. Consider integration test scenarios

## Notes

- Tests use `vitest` as the testing framework
- Mock functions use `vi.fn()` for consistent behavior
- Type assertions (`as any`) are used where necessary for test flexibility
- Tests focus on behavior rather than implementation details
- Error scenarios are thoroughly tested to ensure robustness
