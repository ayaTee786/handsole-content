import { useState, useCallback } from 'react';
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
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

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

  const downloadListing = () => {
    if (!listing) return;

    const content = `
HANDSOLE ETSY LISTING PACKAGE
=============================

PRODUCT ANALYSIS
----------------
${listing.productAnalysis || 'N/A'}

FOCUS KEYWORD
-------------
${listing.focusKeyword || 'N/A'}

SUPPORTING KEYWORDS
-------------------
${listing.supportingKeywords || 'N/A'}

ETSY TITLE (${listing.title?.length || 0} chars)
----------
${listing.title || 'N/A'}

ETSY 13 TAGS
------------
${listing.tags || 'N/A'}

DESCRIPTION
-----------
${listing.description || 'N/A'}

ETSY ATTRIBUTES
---------------
${listing.attributes || 'N/A'}

IMAGE ALT TEXTS
---------------
${listing.altTexts || 'N/A'}

IMAGE FILE NAMES
----------------
${listing.fileNames || 'N/A'}

SKU
---
${listing.sku || 'N/A'}

SHOP CATEGORY
-------------
${listing.shopCategory || 'N/A'}

BEST OCCASIONS
--------------
${listing.occasions || 'N/A'}

KEYWORDS USED COUNT
-------------------
${listing.keywordsUsed || 'N/A'}
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `handsole-etsy-listing-${Date.now()}.txt`;
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
              <button className="download-btn" onClick={downloadListing}>
                📥 Download All
              </button>
            </div>

            <ListingCard title="📊 Product Analysis" content={listing.productAnalysis} section="analysis" />
            <ListingCard title="🎯 Focus Keyword" content={listing.focusKeyword} section="focus" />
            <ListingCard title="🔑 Supporting Keywords" content={listing.supportingKeywords} section="supporting" />
            <ListingCard title={`📝 Etsy Title (${listing.title?.length || 0} chars)`} content={listing.title} section="title" />
            <ListingCard title="🏷️ Etsy 13 Tags" content={listing.tags} section="tags" />
            <ListingCard title="📄 Description" content={listing.description} section="description" />
            <ListingCard title="📋 Etsy Attributes" content={listing.attributes} section="attributes" />
            <ListingCard title="🖼️ Image Alt Texts" content={listing.altTexts} section="alts" />
            <ListingCard title="📁 Image File Names" content={listing.fileNames} section="files" />
            <ListingCard title="🔢 SKU" content={listing.sku} section="sku" />
            <ListingCard title="📂 Shop Category" content={listing.shopCategory} section="category" />
            <ListingCard title="🎉 Best Occasions" content={listing.occasions} section="occasions" />
            <ListingCard title="📈 Keywords Used Count" content={listing.keywordsUsed} section="keywords" />
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Handsole Etsy Listing Generator • Powered by Claude AI</p>
      </footer>
    </div>
  );
}

export default App;
