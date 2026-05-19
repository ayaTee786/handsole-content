import { useState, useCallback, useEffect } from 'react';
import './App.css';

function App() {
  const [images, setImages] = useState([]);
  const [imageBase64s, setImageBase64s] = useState([]);
  const [productDetails, setProductDetails] = useState({
    additionalColors: '',
    customNotes: ''
  });
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [copiedSection, setCopiedSection] = useState(null);
  const [listingHistory, setListingHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('handsole-listing-history');
    if (saved) {
      try {
        setListingHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load history:', e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (listingHistory.length > 0) {
      localStorage.setItem('handsole-listing-history', JSON.stringify(listingHistory));
    }
  }, [listingHistory]);

  const handleImageUpload = useCallback((e) => {
    const files = Array.from(e.target.files || e.dataTransfer?.files || []);
    const newImages = [];
    const newBase64s = [];

    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          newImages.push(URL.createObjectURL(file));
          newBase64s.push(event.target.result.split(',')[1]);

          if (newImages.length === files.length) {
            setImages(prev => [...prev, ...newImages]);
            setImageBase64s(prev => [...prev, ...newBase64s]);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }, []);

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImageBase64s(prev => prev.filter((_, i) => i !== index));
  };

  const generateListing = async () => {
    if (imageBase64s.length === 0) {
      setError('Please upload at least one product image');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch('/api/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: imageBase64s,
          additionalColors: productDetails.additionalColors,
          customNotes: productDetails.customNotes
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate listing');
      }

      const data = await response.json();
      setListing(data);
      
      // Save to history with thumbnail
      const historyItem = {
        id: Date.now(),
        date: new Date().toISOString(),
        thumbnail: `data:image/jpeg;base64,${imageBase64s[0]}`,
        title: data.title || 'Untitled Listing',
        focusKeyword: data.focusKeyword || '',
        sku: data.sku || '',
        listing: data
      };
      
      setListingHistory(prev => [historyItem, ...prev]);
      setActiveTab('listing');
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try with a smaller image.');
      } else {
        setError(err.message || 'An error occurred while generating the listing');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, section) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const downloadListing = (listingData = listing) => {
    if (!listingData) return;

    const content = `
HANDSOLE ETSY LISTING PACKAGE
Generated: ${new Date().toLocaleString()}
=============================

1. PRODUCT ANALYSIS
-------------------
${listingData.productAnalysis || 'N/A'}

2. FOCUS KEYWORD
----------------
${listingData.focusKeyword || 'N/A'}

3. SUPPORTING KEYWORDS
----------------------
${listingData.supportingKeywords || 'N/A'}

4. ETSY TITLE (${listingData.title?.length || 0} chars)
--------------
${listingData.title || 'N/A'}

5. ETSY 13 TAGS
---------------
${listingData.tags || 'N/A'}

6. DESCRIPTION
--------------
${listingData.description || 'N/A'}

7. ETSY ATTRIBUTES
------------------
${listingData.attributes || 'N/A'}

8. IMAGE ALT TEXTS
------------------
${listingData.altTexts || 'N/A'}

9. IMAGE FILE NAMES
-------------------
${listingData.fileNames || 'N/A'}

10. SKU
-------
${listingData.sku || 'N/A'}

11. SHOP CATEGORY
-----------------
${listingData.shopCategory || 'N/A'}

12. BEST OCCASIONS
------------------
${listingData.occasions || 'N/A'}

13. KEYWORDS USED COUNT
-----------------------
${listingData.keywordsUsed || 'N/A'}
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sku = listingData.sku?.replace(/[^a-zA-Z0-9-]/g, '') || 'listing';
    a.download = `handsole-${sku}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const viewHistoryItem = (item) => {
    setSelectedHistoryItem(item);
    setListing(item.listing);
    setActiveTab('listing');
  };

  const deleteHistoryItem = (id, e) => {
    e.stopPropagation();
    if (confirm('Delete this listing from history?')) {
      setListingHistory(prev => prev.filter(item => item.id !== id));
      if (selectedHistoryItem?.id === id) {
        setSelectedHistoryItem(null);
        setListing(null);
      }
    }
  };

  const clearHistory = () => {
    if (confirm('Clear ALL listing history? This cannot be undone.')) {
      setListingHistory([]);
      localStorage.removeItem('handsole-listing-history');
      setSelectedHistoryItem(null);
    }
  };

  const exportAllHistory = () => {
    const data = JSON.stringify(listingHistory, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `handsole-all-listings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ListingCard = ({ title, content, section }) => (
    <div className="listing-card">
      <div className="card-header">
        <h3>{title}</h3>
        <button 
          className={`copy-btn ${copiedSection === section ? 'copied' : ''}`}
          onClick={() => copyToClipboard(content, section)}
        >
          {copiedSection === section ? '✓ Copied!' : 'Copy'}
        </button>
      </div>
      <div className="card-content">
        <pre>{content}</pre>
      </div>
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <h1>👞 Handsole Etsy Generator</h1>
        <p>Transform product images into SEO-optimized Etsy listings</p>
      </header>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          📷 Upload
        </button>
        <button 
          className={`tab ${activeTab === 'listing' ? 'active' : ''}`}
          onClick={() => setActiveTab('listing')}
          disabled={!listing}
        >
          📝 Listing
        </button>
        <button 
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📚 History ({listingHistory.length})
        </button>
      </div>

      <main className="main">
        {activeTab === 'upload' && (
          <div className="upload-section">
            <div 
              className="dropzone"
              onDrop={(e) => { e.preventDefault(); handleImageUpload(e); }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('file-input').click()}
            >
              <input
                id="file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <p>Drop product images here or click to upload</p>
              <span>Upload multiple angles for best results</span>
            </div>

            {images.length > 0 && (
              <div className="image-preview">
                {images.map((img, index) => (
                  <div key={index} className="preview-item">
                    <img src={img} alt={`Product ${index + 1}`} />
                    <button className="remove-btn" onClick={() => removeImage(index)}>×</button>
                    <span className="image-number">{index + 1}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="options-section">
              <h3>Additional Options</h3>
              <div className="form-group">
                <label>Additional Colors Available</label>
                <input
                  type="text"
                  placeholder="e.g., Navy Blue, Burgundy, Tan (comma-separated)"
                  value={productDetails.additionalColors}
                  onChange={(e) => setProductDetails(prev => ({ ...prev, additionalColors: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Custom Notes</label>
                <textarea
                  placeholder="Any specific details about this product..."
                  value={productDetails.customNotes}
                  onChange={(e) => setProductDetails(prev => ({ ...prev, customNotes: e.target.value }))}
                />
              </div>
            </div>

            {error && <div className="error-message">⚠️ {error}</div>}

            <button 
              className="generate-btn"
              onClick={generateListing}
              disabled={loading || images.length === 0}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Generating... (up to 60 seconds)
                </>
              ) : (
                <>✨ Generate Etsy Listing</>
              )}
            </button>
          </div>
        )}

        {activeTab === 'listing' && listing && (
          <div className="listing-section">
            <div className="listing-header">
              <h2>Generated Listing</h2>
              <div className="header-actions">
                <button className="download-btn" onClick={() => downloadListing()}>
                  📥 Download
                </button>
                <button className="new-btn" onClick={() => { setActiveTab('upload'); setListing(null); setImages([]); setImageBase64s([]); }}>
                  ➕ New Listing
                </button>
              </div>
            </div>

            {selectedHistoryItem && (
              <div className="history-notice">
                Viewing saved listing from {new Date(selectedHistoryItem.date).toLocaleDateString()}
              </div>
            )}

            <ListingCard title="📊 1. Product Analysis" content={listing.productAnalysis} section="analysis" />
            <ListingCard title="🎯 2. Focus Keyword" content={listing.focusKeyword} section="focus" />
            <ListingCard title="🔑 3. Supporting Keywords" content={listing.supportingKeywords} section="supporting" />
            <ListingCard title={`📝 4. Etsy Title (${listing.title?.length || 0} chars)`} content={listing.title} section="title" />
            <ListingCard title="🏷️ 5. Etsy 13 Tags" content={listing.tags} section="tags" />
            <ListingCard title="📄 6. Description" content={listing.description} section="description" />
            <ListingCard title="📋 7. Etsy Attributes" content={listing.attributes} section="attributes" />
            <ListingCard title="🖼️ 8. Image Alt Texts" content={listing.altTexts} section="alts" />
            <ListingCard title="📁 9. Image File Names" content={listing.fileNames} section="files" />
            <ListingCard title="🔢 10. SKU" content={listing.sku} section="sku" />
            <ListingCard title="📂 11. Shop Category" content={listing.shopCategory} section="category" />
            <ListingCard title="🎉 12. Best Occasions" content={listing.occasions} section="occasions" />
            <ListingCard title="📈 13. Keywords Used Count" content={listing.keywordsUsed} section="keywords" />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="history-section">
            <div className="history-header">
              <h2>📚 Listing History</h2>
              {listingHistory.length > 0 && (
                <div className="history-actions">
                  <button className="export-btn" onClick={exportAllHistory}>
                    📤 Export All
                  </button>
                  <button className="clear-btn" onClick={clearHistory}>
                    🗑️ Clear All
                  </button>
                </div>
              )}
            </div>

            {listingHistory.length === 0 ? (
              <div className="empty-history">
                <p>No listings generated yet.</p>
                <p>Upload a product image to create your first listing!</p>
              </div>
            ) : (
              <div className="history-grid">
                {listingHistory.map((item) => (
                  <div 
                    key={item.id} 
                    className={`history-item ${selectedHistoryItem?.id === item.id ? 'selected' : ''}`}
                    onClick={() => viewHistoryItem(item)}
                  >
                    <div className="history-thumbnail">
                      <img src={item.thumbnail} alt={item.title} />
                    </div>
                    <div className="history-info">
                      <h4>{item.title?.substring(0, 50) || 'Untitled'}...</h4>
                      <p className="history-keyword">{item.focusKeyword}</p>
                      <p className="history-sku">{item.sku}</p>
                      <p className="history-date">{new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString()}</p>
                    </div>
                    <div className="history-actions-item">
                      <button 
                        className="download-small-btn" 
                        onClick={(e) => { e.stopPropagation(); downloadListing(item.listing); }}
                        title="Download"
                      >
                        📥
                      </button>
                      <button 
                        className="delete-btn" 
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Handsole Etsy Listing Generator • Powered by Claude AI</p>
        <p className="footer-note">Listings saved locally in your browser</p>
      </footer>
    </div>
  );
}

export default App;
