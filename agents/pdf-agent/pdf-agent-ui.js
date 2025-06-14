export const UPLOAD_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LoreSmith PDF Upload</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh; padding: 20px;
        }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; font-weight: 700; }
        .header p { font-size: 1.1em; opacity: 0.9; }
        .content { padding: 40px; }
        .auth-section { margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 10px; border: 2px solid #e9ecef; }
        .auth-section h3 { color: #2c3e50; margin-bottom: 15px; }
        .rate-limit-info { margin-top: 10px; padding: 8px; background: #e8f4f8; border-radius: 4px; }
        .rate-limit-info small { color: #17a2b8; }
        .input-group { margin-bottom: 20px; }
        .input-group label { display: block; margin-bottom: 5px; font-weight: 600; color: #2c3e50; }
        .input-group input { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; transition: border-color 0.3s; }
        .input-group input:focus { outline: none; border-color: #3498db; }
        .upload-area { border: 3px dashed #ddd; border-radius: 15px; padding: 60px 20px; text-align: center; transition: all 0.3s ease; margin-bottom: 20px; cursor: pointer; }
        .upload-area:hover { border-color: #3498db; background: #f8f9fa; }
        .upload-area.dragover { border-color: #27ae60; background: #d5f4e6; }
        .upload-icon { font-size: 4em; color: #3498db; margin-bottom: 20px; }
        .upload-text { font-size: 1.2em; color: #2c3e50; margin-bottom: 10px; }
        .upload-subtext { color: #7f8c8d; margin-bottom: 20px; }
        .file-input { display: none; }
        .btn { background: linear-gradient(135deg, #3498db, #2980b9); color: white; border: none; padding: 12px 30px; border-radius: 8px; font-size: 16px; cursor: pointer; transition: transform 0.2s; }
        .btn:hover { transform: translateY(-2px); }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .progress-bar { width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; margin: 20px 0; display: none; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #27ae60, #2ecc71); width: 0%; transition: width 0.3s; }
        .status { padding: 15px; border-radius: 8px; margin: 15px 0; display: none; }
        .status.success { background: #d5f4e6; color: #27ae60; border: 1px solid #27ae60; }
        .status.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .status.info { background: #cce7ff; color: #0066cc; border: 1px solid #0066cc; }
        .file-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; display: none; }
        .file-info h4 { color: #2c3e50; margin-bottom: 10px; }
        .file-details { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px; color: #7f8c8d; }
        .pdfs-list { margin-top: 40px; }
        .pdfs-list h3 { color: #2c3e50; margin-bottom: 20px; }
        .pdf-item { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        .pdf-item .pdf-name { font-weight: 600; color: #2c3e50; }
        .pdf-item .pdf-size { color: #7f8c8d; font-size: 14px; }
        .pdf-item .pdf-actions { display: flex; gap: 10px; }
        .pdf-item .pdf-actions a { color: #3498db; text-decoration: none; font-size: 14px; }
        .pdf-item .pdf-actions a:hover { text-decoration: underline; }
        .delete-btn { background: #e74c3c; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
        .delete-btn:hover { background: #c0392b; }
        .download-btn { background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
        .download-btn:hover { background: #218838; }
        .info-btn { background: #17a2b8; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
        .info-btn:hover { background: #138496; }
        .raw-info-btn { background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
        .raw-info-btn:hover { background: #5a6268; }
        .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); }
        .modal-content { background: white; margin: 5% auto; padding: 20px; border-radius: 10px; width: 80%; max-width: 600px; max-height: 80%; overflow-y: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modal-close { background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
        .modal-close:hover { background: #5a6268; }
        .metadata-section { margin-bottom: 20px; }
        .metadata-section h4 { color: #2c3e50; margin-bottom: 10px; }
        .metadata-item { margin-bottom: 8px; }
        .metadata-label { font-weight: 600; color: #495057; }
        .text-preview { background: #f8f9fa; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 14px; max-height: 200px; overflow-y: auto; }
        @media (max-width: 600px) { .header h1 { font-size: 2em; } .content { padding: 20px; } .upload-area { padding: 40px 15px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎲 LoreSmith PDF Upload</h1>
            <p>Upload your D&D PDFs securely - up to 200MB supported</p>
        </div>
        <div class="content">
            <div class="auth-section">
                <h3>🔐 Authentication</h3>
                <div class="input-group">
                    <label for="apiKey">API Key</label>
                    <input type="password" id="apiKey" placeholder="Enter your API key">
                </div>
                <div id="rateLimitInfo" class="rate-limit-info" style="display: none;">
                    <small id="rateLimitText"></small>
                </div>
            </div>
            <div class="upload-area" id="uploadArea">
                <div class="upload-icon">📄</div>
                <h3 class="upload-text">Drag & Drop your PDF here</h3>
                <p class="upload-subtext">or click to browse files</p>
                <button class="btn" onclick="document.getElementById('fileInput').click()">Choose PDF File</button>
                <input type="file" id="fileInput" class="file-input" accept=".pdf" />
            </div>
            <div class="input-group">
                <label for="pdfName">PDF Name (optional)</label>
                <input type="text" id="pdfName" placeholder="Custom name for your PDF">
            </div>
            <div class="input-group">
                <label for="pdfTags">Tags (optional)</label>
                <input type="text" id="pdfTags" placeholder="e.g., campaign, rules, homebrew">
            </div>
            <div class="file-info" id="fileInfo">
                <h4>📋 File Information</h4>
                <div class="file-details" id="fileDetails"></div>
            </div>
            <div class="progress-bar" id="progressBar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="status" id="status"></div>
            <div class="pdfs-list" id="pdfsList">
                <h3>📚 Your PDFs</h3>
                <div id="pdfsContainer"></div>
            </div>
        </div>
    </div>
    
    <!-- PDF Details Modal -->
    <div id="pdfModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>PDF Details</h3>
                <button class="modal-close" onclick="closePDFModal()">Close</button>
            </div>
            <div id="modalContent">
                <p>Loading...</p>
            </div>
        </div>
    </div>
    <script>
        let currentFile = null;
        let apiKey = localStorage.getItem('loresmith_api_key') || '';
        
        document.addEventListener('DOMContentLoaded', function() {
            if (apiKey) {
                document.getElementById('apiKey').value = apiKey;
                loadPDFs();
            }
            setupEventListeners();
        });
        
        function setupEventListeners() {
            const uploadArea = document.getElementById('uploadArea');
            const fileInput = document.getElementById('fileInput');
            const apiKeyInput = document.getElementById('apiKey');
            
            apiKeyInput.addEventListener('change', function() {
                apiKey = this.value;
                localStorage.setItem('loresmith_api_key', apiKey);
                if (apiKey) loadPDFs();
            });
            
            uploadArea.addEventListener('dragover', function(e) {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });
            
            uploadArea.addEventListener('dragleave', function(e) {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
            });
            
            uploadArea.addEventListener('drop', function(e) {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleFile(files[0]);
                }
            });
            
            fileInput.addEventListener('change', function(e) {
                if (e.target.files.length > 0) {
                    handleFile(e.target.files[0]);
                }
            });
            
            uploadArea.addEventListener('click', function() {
                fileInput.click();
            });
        }
        
        function handleFile(file) {
            if (file.type !== 'application/pdf') {
                showStatus('error', 'Please select a PDF file');
                return;
            }
            if (!apiKey) {
                showStatus('error', 'Please enter your API key first');
                return;
            }
            currentFile = file;
            showFileInfo(file);
            setTimeout(uploadFile, 1000);
        }
        
        function showFileInfo(file) {
            const fileInfo = document.getElementById('fileInfo');
            const fileDetails = document.getElementById('fileDetails');
            const sizeString = formatFileSize(file.size);
            const uploadMethod = file.size > 95 * 1024 * 1024 ? 'Presigned URL (Large File)' : 'Direct Upload';
            fileDetails.innerHTML = \`
                <div><strong>Name:</strong> \${file.name}</div>
                <div><strong>Size:</strong> \${sizeString}</div>
                <div><strong>Type:</strong> \${file.type}</div>
                <div><strong>Upload Method:</strong> \${uploadMethod}</div>
            \`;
            fileInfo.style.display = 'block';
        }
        
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        async function uploadFile() {
            if (!currentFile || !apiKey) return;
            const pdfName = document.getElementById('pdfName').value;
            const pdfTags = document.getElementById('pdfTags').value;
            showProgress(0);
            showStatus('info', 'Starting upload...');
            try {
                if (currentFile.size > 95 * 1024 * 1024) {
                    await uploadLargeFile(currentFile, pdfName, pdfTags);
                } else {
                    await uploadSmallFile(currentFile, pdfName, pdfTags);
                }
            } catch (error) {
                showStatus('error', 'Upload failed: ' + error.message);
                hideProgress();
                
                // Check if it's a rate limit error and show info
                if (error.message.includes('Rate limit')) {
                    showRateLimitInfo('Rate limits: 10 uploads/hour, 50 uploads/day');
                }
            }
        }
        
        async function uploadSmallFile(file, name, tags) {
            const formData = new FormData();
            formData.append('file', file);
            if (name) formData.append('name', name);
            if (tags) formData.append('tags', tags);
            const response = await fetch('/upload', {
                method: 'POST',
                headers: { 'Authorization': \`Bearer \${apiKey}\` },
                body: formData
            });
            const result = await response.json();
            if (result.success) {
                showProgress(100);
                showStatus('success', 'Upload completed successfully!');
                setTimeout(() => { hideProgress(); clearForm(); loadPDFs(); }, 2000);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        }
        
        async function uploadLargeFile(file, name, tags) {
            showStatus('info', 'Requesting upload URL...');
            showProgress(10);
            const requestResponse = await fetch('/upload/request', {
                method: 'POST',
                headers: { 'Authorization': \`Bearer \${apiKey}\`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, size: file.size, name: name, tags: tags })
            });
            const requestResult = await requestResponse.json();
            if (!requestResult.success) {
                throw new Error(requestResult.error || 'Failed to get upload URL');
            }
            showStatus('info', 'Uploading to storage...');
            showProgress(30);
            const uploadResponse = await fetch(requestResult.presigned_url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/pdf' },
                body: file
            });
            if (!uploadResponse.ok) {
                throw new Error('Failed to upload to storage');
            }
            showStatus('info', 'Finalizing upload...');
            showProgress(90);
            const completeResponse = await fetch('/upload/complete', {
                method: 'POST',
                headers: { 'Authorization': \`Bearer \${apiKey}\`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ upload_id: requestResult.upload_id, etag: uploadResponse.headers.get('etag') })
            });
            const completeResult = await completeResponse.json();
            if (completeResult.success) {
                showProgress(100);
                showStatus('success', 'Large file upload completed successfully!');
                setTimeout(() => { hideProgress(); clearForm(); loadPDFs(); }, 2000);
            } else {
                throw new Error(completeResult.error || 'Failed to complete upload');
            }
        }
        
        async function loadPDFs() {
            const currentApiKey = document.getElementById('apiKey').value.trim();
            if (!currentApiKey) return;
            try {
                const response = await fetch('/pdfs', {
                    headers: { 'Authorization': \`Bearer \${currentApiKey}\` }
                });
                const result = await response.json();
                if (result.pdfs) {
                    displayPDFs(result.pdfs);
                }
            } catch (error) {
                console.error('Failed to load PDFs:', error);
            }
        }
        
        function displayPDFs(pdfs) {
            const container = document.getElementById('pdfsContainer');
            if (pdfs.length === 0) {
                container.innerHTML = '<p>No PDFs uploaded yet.</p>';
                return;
            }
            container.innerHTML = pdfs.map(pdf => \`
                <div class="pdf-item">
                    <div>
                        <div class="pdf-name">\${pdf.originalName}</div>
                        <div class="pdf-size">\${formatFileSize(pdf.size)} • \${pdf.tags.join(', ')}</div>
                    </div>
                                         <div class="pdf-actions">
                         <button class="download-btn" onclick="downloadPDF('\${pdf.id}')">Download</button>
                         <button class="info-btn" onclick="viewPDFDetails('\${pdf.id}')">Details</button>
                         <button class="raw-info-btn" onclick="viewRawInfo('\${pdf.id}')">Raw Info</button>
                         <button class="delete-btn" onclick="deletePDF('\${pdf.id}', '\${pdf.originalName}')">Delete</button>
                     </div>
                </div>
            \`).join('');
        }
        
        function showStatus(type, message) {
            const status = document.getElementById('status');
            status.className = \`status \${type}\`;
            status.textContent = message;
            status.style.display = 'block';
        }
        
        function showProgress(percent) {
            const progressBar = document.getElementById('progressBar');
            const progressFill = document.getElementById('progressFill');
            progressBar.style.display = 'block';
            progressFill.style.width = percent + '%';
        }
        
        function hideProgress() {
            document.getElementById('progressBar').style.display = 'none';
        }
        
        function clearForm() {
            document.getElementById('pdfName').value = '';
            document.getElementById('pdfTags').value = '';
            document.getElementById('fileInput').value = '';
            document.getElementById('fileInfo').style.display = 'none';
            currentFile = null;
        }
        
        async function deletePDF(pdfId, pdfName) {
            const currentApiKey = document.getElementById('apiKey').value.trim();
            if (!currentApiKey) {
                showStatus('error', 'Please enter your API key first');
                return;
            }
            
            if (!confirm(\`Are you sure you want to delete "\${pdfName}"? This action cannot be undone.\`)) {
                return;
            }
            
            try {
                showStatus('info', 'Deleting PDF...');
                
                const response = await fetch(\`/pdf/\${pdfId}\`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': \`Bearer \${currentApiKey}\`
                    }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showStatus('success', 'PDF deleted successfully!');
                    setTimeout(() => {
                        loadPDFs(); // Refresh the list
                    }, 1000);
                } else {
                    throw new Error(result.error || 'Failed to delete PDF');
                }
                         } catch (error) {
                 showStatus('error', 'Delete failed: ' + error.message);
             }
         }
         
         async function viewPDFDetails(pdfId) {
             const currentApiKey = document.getElementById('apiKey').value.trim();
             if (!currentApiKey) {
                 showStatus('error', 'Please enter your API key first');
                 return;
             }
             
             const modal = document.getElementById('pdfModal');
             const modalContent = document.getElementById('modalContent');
             
             // Show modal with loading state
             modalContent.innerHTML = '<p>Loading PDF details...</p>';
             modal.style.display = 'block';
             
             try {
                 const response = await fetch(\`/pdf/\${pdfId}/metadata\`, {
                     headers: {
                         'Authorization': \`Bearer \${currentApiKey}\`
                     }
                 });
                 
                 const metadata = await response.json();
                 
                 if (metadata.error) {
                     throw new Error(metadata.error);
                 }
                 
                 // Display the metadata in a nice format
                 modalContent.innerHTML = \`
                     <div class="metadata-section">
                         <h4>📄 File Information</h4>
                         <div class="metadata-item">
                             <span class="metadata-label">Original Name:</span> \${metadata.originalName || 'N/A'}
                         </div>
                         <div class="metadata-item">
                             <span class="metadata-label">File Size:</span> \${formatFileSize(metadata.size || 0)}
                         </div>
                         <div class="metadata-item">
                             <span class="metadata-label">Upload Date:</span> \${new Date(metadata.uploadDate).toLocaleString()}
                         </div>
                         <div class="metadata-item">
                             <span class="metadata-label">Tags:</span> \${metadata.tags?.join(', ') || 'None'}
                         </div>
                     </div>
                     
                     \${metadata.pdfMetadata ? \`
                     <div class="metadata-section">
                         <h4>📋 PDF Metadata</h4>
                         <div class="metadata-item">
                             <span class="metadata-label">Title:</span> \${metadata.pdfMetadata.title || 'N/A'}
                         </div>
                         <div class="metadata-item">
                             <span class="metadata-label">Author:</span> \${metadata.pdfMetadata.author || 'N/A'}
                         </div>
                         <div class="metadata-item">
                             <span class="metadata-label">Subject:</span> \${metadata.pdfMetadata.subject || 'N/A'}
                         </div>
                         <div class="metadata-item">
                             <span class="metadata-label">Creator:</span> \${metadata.pdfMetadata.creator || 'N/A'}
                         </div>
                         <div class="metadata-item">
                             <span class="metadata-label">Pages:</span> \${metadata.pdfMetadata.pages || 'N/A'}
                         </div>
                         <div class="metadata-item">
                             <span class="metadata-label">Creation Date:</span> \${metadata.pdfMetadata.creationDate ? new Date(metadata.pdfMetadata.creationDate).toLocaleString() : 'N/A'}
                         </div>
                     </div>
                     \` : ''}
                     
                     \${metadata.textPreview ? \`
                     <div class="metadata-section">
                         <h4>📝 Text Preview</h4>
                         <div class="text-preview">\${metadata.textPreview}</div>
                     </div>
                     \` : ''}
                 \`;
                 
             } catch (error) {
                 modalContent.innerHTML = \`<p style="color: #e74c3c;">Error loading PDF details: \${error.message}</p>\`;
             }
         }
         
         function closePDFModal() {
             document.getElementById('pdfModal').style.display = 'none';
         }
         
                   // Close modal when clicking outside of it
          window.onclick = function(event) {
              const modal = document.getElementById('pdfModal');
              if (event.target === modal) {
                  closePDFModal();
              }
          }
          
          function showRateLimitInfo(message) {
              const rateLimitInfo = document.getElementById('rateLimitInfo');
              const rateLimitText = document.getElementById('rateLimitText');
              rateLimitText.textContent = message;
              rateLimitInfo.style.display = 'block';
          }
          
          async function downloadPDF(pdfId) {
              const currentApiKey = document.getElementById('apiKey').value.trim();
              if (!currentApiKey) {
                  showStatus('error', 'Please enter your API key first');
                  return;
              }
              
              try {
                  showStatus('info', 'Preparing download...');
                  
                  const response = await fetch(\`/pdf/\${pdfId}\`, {
                      headers: {
                          'Authorization': \`Bearer \${currentApiKey}\`
                      }
                  });
                  
                  if (!response.ok) {
                      const error = await response.json();
                      throw new Error(error.error || 'Download failed');
                  }
                  
                  // Get the filename from the response headers or use a default
                  const contentDisposition = response.headers.get('content-disposition');
                  let filename = 'download.pdf';
                  if (contentDisposition) {
                      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                      if (filenameMatch) {
                          filename = filenameMatch[1];
                      }
                  }
                  
                  // Create blob and download
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  
                  showStatus('success', 'Download started!');
                  setTimeout(() => {
                      document.getElementById('status').style.display = 'none';
                  }, 2000);
                  
              } catch (error) {
                  showStatus('error', 'Download failed: ' + error.message);
              }
          }
          
          async function viewRawInfo(pdfId) {
              const currentApiKey = document.getElementById('apiKey').value.trim();
              if (!currentApiKey) {
                  showStatus('error', 'Please enter your API key first');
                  return;
              }
              
              try {
                  showStatus('info', 'Fetching raw metadata...');
                  
                  const response = await fetch(\`/pdf/\${pdfId}/metadata\`, {
                      headers: {
                          'Authorization': \`Bearer \${currentApiKey}\`
                      }
                  });
                  
                  const metadata = await response.json();
                  
                  if (metadata.error) {
                      throw new Error(metadata.error);
                  }
                  
                  // Open raw JSON in a new window
                  const newWindow = window.open('', '_blank');
                  newWindow.document.write(\`
                      <html>
                          <head>
                              <title>Raw PDF Metadata</title>
                              <style>
                                  body { font-family: monospace; padding: 20px; background: #f5f5f5; }
                                  pre { background: white; padding: 20px; border-radius: 8px; overflow: auto; }
                              </style>
                          </head>
                          <body>
                              <h2>Raw PDF Metadata</h2>
                              <pre>\${JSON.stringify(metadata, null, 2)}</pre>
                          </body>
                      </html>
                  \`);
                  newWindow.document.close();
                  
                  showStatus('success', 'Raw metadata opened in new window');
                  setTimeout(() => {
                      document.getElementById('status').style.display = 'none';
                  }, 2000);
                  
              } catch (error) {
                  showStatus('error', 'Failed to fetch raw metadata: ' + error.message);
              }
          }
    </script>
</body>
</html>`; 