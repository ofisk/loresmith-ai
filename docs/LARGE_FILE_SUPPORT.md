# Large File Support for D&D Documents

## Overview

Loresmith AI supports document files up to 100MB (the practical limit due to Cloudflare Workers' 128MB memory limit with buffer for overhead). While multipart uploads can technically handle larger files, processing requires files to stay within this limit.

## Implementation Details

### File Size Limits

- **Maximum Document Size**: 100MB (configurable in `src/app-constants.ts`, set to stay under Cloudflare Workers' 128MB memory limit with buffer)
- **Chunk Processing**: 10MB chunks to prevent memory issues
- **Text Extraction Limit**: 5MB of extracted text for processing
- **Timeout**: 2 minutes for large files (≥100MB), 1 minute for smaller files

### Key Features

#### 1. Chunked Processing

Large documents are processed in 10MB chunks to prevent memory pressure:

```typescript
const chunkSize = FILE_PROCESSING_CONFIG.INGEST_CHUNK_SIZE; // 10MB
const totalChunks = Math.ceil(fileString.length / chunkSize);
```

#### 2. Adaptive Timeouts

- **Small files** (<100MB): 60 seconds timeout
- **Large files** (≥100MB): 120 seconds timeout
- **Progress logging** for files processed in multiple chunks

#### 3. Memory Protection

- **Text truncation**: Extracted text limited to 5MB
- **Chunked extraction**: Document content processed in manageable pieces
- **Error handling**: Graceful degradation for corrupted or unreadable documents

#### 4. Event Loop Protection

- **Timeout promises**: Prevents hanging operations
- **Non-blocking processing**: Maintains application responsiveness
- **Progress tracking**: Real-time feedback during processing

## Configuration

All limits are configurable in `src/constants.ts`:

```typescript
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB limit (Cloudflare Workers have 128MB memory limit, leaving buffer for overhead)
  INGEST_CHUNK_SIZE: 10 * 1024 * 1024, // 10MB chunks for processing
  MAX_TEXT_LENGTH: 5 * 1024 * 1024, // 5MB text limit
  TIMEOUT_SMALL_FILES: 60000, // 1 minute for files < 100MB
  TIMEOUT_LARGE_FILES: 120000, // 2 minutes for files >= 100MB
  LARGE_FILE_THRESHOLD: 100 * 1024 * 1024, // 100MB threshold
} as const;
```

## Performance Optimizations

### For Large Documents (>100MB):

1. **Larger chunks**: 2000 characters instead of 1000
2. **More overlap**: 300 characters for better context
3. **Extended timeouts**: 2 minutes for processing
4. **Progress logging**: Real-time chunk processing updates

### Memory Management:

1. **Streaming approach**: Process documents in chunks
2. **Text truncation**: Limit extracted text to 5MB
3. **Garbage collection**: Automatic cleanup of processed chunks
4. **Error recovery**: Graceful handling of memory issues

## Best Practices

### For Users:

- **Upload during off-peak hours** for very large files
- **Monitor progress logs** in the console
- **Be patient** - large files take 1-2 minutes to process
- **Check file integrity** before uploading

### For Developers:

- **Monitor memory usage** during large file processing
- **Adjust timeouts** based on server capacity
- **Test with various document sizes** to ensure stability
- **Consider implementing resumable uploads** for very large files

## Troubleshooting

### Common Issues:

1. **"Document too large" error**
   - File exceeds 100MB limit
   - Solution: Compress document or split into smaller files

2. **Processing timeout**
   - File takes longer than 2 minutes to process
   - Solution: Check server resources or try during off-peak hours

3. **Memory errors**
   - Server runs out of memory during processing
   - Solution: Reduce chunk size or increase server memory

4. **Text extraction fails**
   - Document is corrupted or image-based
   - Solution: Use OCR tools or provide manual description

## Future Enhancements

1. **Resumable uploads**: Support for interrupted uploads
2. **Background processing**: Queue-based processing for large files
3. **OCR integration**: Better text extraction from image-based documents
4. **Compression**: Automatic document compression before processing
5. **Progress indicators**: UI feedback during processing

## References

- [Handling Large File Uploads in React with Node.js](https://mvineetsharma.medium.com/handling-large-file-uploads-in-react-with-node-js-ac26cce388b2)
- [Top 10 Solutions for Large File Uploads in Node.js](https://arunangshudas.medium.com/top-10-solutions-for-large-file-uploads-in-node-js-f8cae7871855)
- [Event Loop Lag Management](https://trigger.dev/blog/event-loop-lag)
