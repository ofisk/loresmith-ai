-- E2E cleanup: remove e2e-test-user's library files so upload tests can reuse sample.txt
DELETE FROM sync_queue WHERE username = 'e2e-test-user';
DELETE FROM file_chunks WHERE username = 'e2e-test-user';
DELETE FROM file_metadata WHERE username = 'e2e-test-user';
