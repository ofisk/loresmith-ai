-- E2E cleanup: remove e2e-test-user's data for fresh test state
DELETE FROM sync_queue WHERE username = 'e2e-test-user';
DELETE FROM file_chunks WHERE username = 'e2e-test-user';
DELETE FROM file_metadata WHERE username = 'e2e-test-user';
DELETE FROM campaigns WHERE username = 'e2e-test-user';
