/**
 * PDF Test Suite Index
 *
 * This file imports and runs all PDF-related tests together:
 * - Upload functionality tests
 * - Authentication tests
 * - Management tests
 *
 * This provides a convenient way to run the entire PDF test suite
 * and ensures all PDF functionality is properly tested.
 */

// Import all PDF test files
import "./upload.test";
import "./management.test";

/**
 * PDF Test Suite Summary
 *
 * The PDF test suite covers:
 *
 * 1. Upload Functionality:
 *    - Upload URL generation
 *    - Direct file upload to R2
 *    - File validation and error handling
 *
 * 2. Authentication:
 *    - Session authentication with admin key
 *    - Authentication status checking
 *    - Session management and state tracking
 *
 * 3. Management:
 *    - File listing and metadata
 *    - PDF ingestion and processing
 *    - Error handling and validation
 *
 * Each test file focuses on a specific aspect of PDF functionality,
 * making the test suite modular and maintainable.
 */
