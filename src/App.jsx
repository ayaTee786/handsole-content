import { useState, useCallback, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

// Resize image to small thumbnail before saving to Supabase
const generateThumbnail = (file, maxSize = 80) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState(null);

  const [images, setImages] = useState([]);
  const [imageBase64s, setImageBase64s] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);
  const [productDetails, setProductDetails] = useState({ additionalColors: '', customNotes: '' });
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('generate');
  const [copiedSection, setCopiedSection] = useState(null);
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) fetchListings();
  }, [session]);

  const fetchListings = async () => {
    setListingsLoading(true);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setListings(data || []);
    } catch (err) {
      console.error('Error fetching listings:', err);
    } finally {
      setListingsLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) throw error;
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (error) throw error;
      setAuthError('Check your email for confirmation link!');
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setListings([]);
    setListing(null);
    setSelectedListing(null);
  };

  const handleImageUpload = useCallback((e) => {
    const files = Array.from(e.target.files || e.dataTransfer?.files || []);
    const newImages = [];
    const newBase64s = [];
    const newFiles = [];

    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        newFiles.push(file);
        const reader = new FileReader();
        reader.onload = (event) => {
          newImages.push(URL.createObjectURL(file));
          newBase64s.push(event.target.result.split(',')[1]);
          if (newImages.length === files.length) {
            setImages(prev => [...prev, ...newImages]);
            setImageBase64s(prev => [...prev, ...newBase64s]);
            setImageFiles(prev => [...prev, ...newFiles]);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }, []);

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImageBase64s(prev => prev.filter((_, i) => i !== index));
    setImageFiles(prev => prev.filter((_, i) => i !== index));
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

      // Generate tiny 80px thumbnail from raw File — much smaller than full base64
      const thumbnail = imageFiles[0] ? await generateThumbnail(imageFiles[0]) : null;

      const { error: insertError } = await supabase.from('listings').insert({
        user_id: session.user.id,
        thumbnail: thumbnail,
        title: data.title || 'Untitled',
        focus_keyword: data.focusKeyword || '',
        sku: data.sku || '',
        product_analysis: data.productAnalysis || '',
        supporting_keywords: data.supportingKeywords || '',
        tags: data.tags || '',
        description: data.description || '',
        attributes: data.attributes || '',
        alt_texts: data.altTexts || '',
        file_names: data.fileNames || '',
        shop_category: data.shopCategory || '',
        occasions: data.occasions || '',
        keywords_used: data.keywordsUsed || ''
      });

      if (insertError) {
        console.error('Error saving listing:', insertError);
      } else {
        fetchListings();
      }
      setActiveTab('result');
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err.message || 'An error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const viewListing = (item) => {
    setSelectedListing(item);
    setListing({
      productAnalysis: item.product_analysis,
      focusKeyword: item.focus_keyword,
      supportingKeywords: item.supporting_keywords,
      title: item.title,
      tags: item.tags,
      description: item.description,
      attributes: item.attributes,
      altTexts: item.alt_texts,
      fileNames: item.file_names,
      sku: item.sku,
      shopCategory: item.shop_category,
      occasions: item.occasions,
      keywordsUsed: item.keywords_used
    });
    setActiveTab('result');
  };

  const deleteListing = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this listing?')) return;
    try {
      const { error } = await supabase.from('listings').delete().eq('id', id);
      if (error) throw error;
      setListings(prev => prev.filter(item => item.id !== id));
      if (selectedListing?.id === id) {
        setSelectedListing(null);
        setListing(null);
      }
    } catch (err) {
      console.error('Error deleting:', err);
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
    const content = `HANDSOLE ETSY LISTING\nGenerated: ${new Date().toLocaleString()}\n================================\n\n1. PRODUCT ANALYSIS\n${listing.productAnalysis || 'N/A'}\n\n2. FOCUS KEYWORD\n${listing.focusKeyword || 'N/A'}\n\n3. SUPPORTING KEYWORDS\n${listing.supportingKeywords || 'N/A'}\n\n4. ETSY TITLE\n${listing.title || 'N/A'}\n\n5. ETSY 13 TAGS\n${listing.tags || 'N/A'}\n\n6. DESCRIPTION\n${listing.description || 'N/A'}\n\n7. ETSY ATTRIBUTES\n${listing.attributes || 'N/A'}\n\n8. IMAGE ALT TEXTS\n${listing.altTexts || 'N/A'}\n\n9. IMAGE FILE NAMES\n${listing.fileNames || 'N/A'}\n\n10. SKU\n${listing.sku || 'N/A'}\n\n11. SHOP CATEGORY\n${listing.shopCategory || 'N/A'}\n\n12. BEST OCCASIONS\n${listing.occasions || 'N/A'}\n\n13. KEYWORDS USED\n${listing.keywordsUsed || 'N/A'}\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `handsole-${listing.sku || 'listing'}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ListingCard = ({ title, content, section }) => (
    <div className="listing-card">
      <div className="card-header">
        <h3>{title}</h3>
        <button className={`copy-btn ${copiedSection === section ? 'copied' : ''}`} onClick={() => copyToClipboard(content, section)}>
          {copiedSection === section ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="card-content"><pre>{content}</pre></div>
    </div>
  );

  if (authLoading) return <div className="auth-loading"><div className="spinner-large"></div></div>;

  if (!session) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <div className="auth-header">
            <h1>HAND<span>SOLE</span></h1>
            <p>Etsy Listing Generator</p>
          </div>
          <div className="auth-tabs">
            <button className={authMode === 'signin' ? 'active' : ''} onClick={() => setAuthMode('signin')}>Sign In</button>
            <button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Sign Up</button>
          </div>
          <form onSubmit={authMode === 'signin' ? handleSignIn : handleSignUp}>
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <button type="submit" className="auth-submit">{authMode === 'signin' ? 'Sign In' : 'Create Account'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left"><h1>HAND<span>SOLE</span></h1></div>
        <div className="header-right">
          <span className="user-email">{session.user.email}</span>
          <button className="sign-out-btn" onClick={handleSignOut}>Sign Out</button>
        </div>
      </header>

      <nav className="nav">
        <button className={activeTab === 'generate' ? 'active' : ''} onClick={() => { setActiveTab('generate'); setSelectedListing(null); }}>Generate</button>
        <button className={activeTab === 'result' ? 'active' : ''} onClick={() => setActiveTab('result')} disabled={!listing}>Result</button>
        <button className={activeTab === 'listings' ? 'active' : ''} onClick={() => setActiveTab('listings')}>All Listings ({listings.length})</button>
      </nav>

      <main className="main">
        {activeTab === 'generate' && (
          <div className="generate-section">
            <div className="section-header"><h2>Generate New Listing</h2></div>
            <div className="upload-area">
              <div className="dropzone"
                onDrop={(e) => { e.preventDefault(); handleImageUpload(e); }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => document.getElementById('file-input').click()}>
                <input id="file-input" type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
                <div className="dropzone-icon">+</div>
                <p>Drop product images here or click to upload</p>
                <span>Use clear, well-lit photos</span>
              </div>
              {images.length > 0 && (
                <div className="image-grid">
                  {images.map((img, index) => (
                    <div key={index} className="image-item">
                      <img src={img} alt={`Product ${index + 1}`} />
                      <button className="remove-btn" onClick={() => removeImage(index)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="options-grid">
              <div className="option-field">
                <label>Additional Colors</label>
                <input type="text" placeholder="Navy Blue, Burgundy, Tan..." value={productDetails.additionalColors} onChange={(e) => setProductDetails(prev => ({ ...prev, additionalColors: e.target.value }))} />
              </div>
              <div className="option-field">
                <label>Custom Notes</label>
                <input type="text" placeholder="Any specific details..." value={productDetails.customNotes} onChange={(e) => setProductDetails(prev => ({ ...prev, customNotes: e.target.value }))} />
              </div>
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button className="generate-btn" onClick={generateListing} disabled={loading || images.length === 0}>
              {loading ? <><span className="spinner"></span>Generating...</> : 'Generate Listing'}
            </button>
          </div>
        )}

        {activeTab === 'result' && listing && (
          <div className="result-section">
            <div className="section-header">
              <h2>{selectedListing ? 'Viewing Saved Listing' : 'Generated Listing'}</h2>
              <div className="section-actions">
                <button className="action-btn" onClick={downloadListing}>Download</button>
                <button className="action-btn primary" onClick={() => { setActiveTab('generate'); setListing(null); setSelectedListing(null); setImages([]); setImageBase64s([]); setImageFiles([]); }}>New Listing</button>
              </div>
            </div>
            <div className="cards-grid">
              <ListingCard title="1. Product Analysis" content={listing.productAnalysis} section="analysis" />
              <ListingCard title="2. Focus Keyword" content={listing.focusKeyword} section="focus" />
              <ListingCard title="3. Supporting Keywords" content={listing.supportingKeywords} section="supporting" />
              <ListingCard title={`4. Title (${listing.title?.length || 0} chars)`} content={listing.title} section="title" />
              <ListingCard title="5. Tags" content={listing.tags} section="tags" />
              <ListingCard title="6. Description" content={listing.description} section="description" />
              <ListingCard title="7. Attributes" content={listing.attributes} section="attributes" />
              <ListingCard title="8. Alt Texts" content={listing.altTexts} section="alts" />
              <ListingCard title="9. File Names" content={listing.fileNames} section="files" />
              <ListingCard title="10. SKU" content={listing.sku} section="sku" />
              <ListingCard title="11. Category" content={listing.shopCategory} section="category" />
              <ListingCard title="12. Occasions" content={listing.occasions} section="occasions" />
              <ListingCard title="13. Keywords Count" content={listing.keywordsUsed} section="keywords" />
            </div>
          </div>
        )}

        {activeTab === 'listings' && (
          <div className="listings-section">
            <div className="section-header">
              <h2>All Listings</h2>
              <span className="listing-count">{listings.length} listings</span>
            </div>
            {listingsLoading ? (
              <div className="loading-state"><div className="spinner"></div><p>Loading listings...</p></div>
            ) : listings.length === 0 ? (
              <div className="empty-state">
                <p>No listings yet</p>
                <button onClick={() => setActiveTab('generate')}>Generate your first listing</button>
              </div>
            ) : (
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Date</th>
                      <th>Title</th>
                      <th>Focus Keyword</th>
                      <th>SKU</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((item) => (
                      <tr key={item.id} onClick={() => viewListing(item)}>
                        <td className="thumbnail-cell">
                          {item.thumbnail ? (
                            <img
                              src={`data:image/jpeg;base64,${item.thumbnail}`}
                              alt={item.title}
                              className="table-thumbnail"
                              style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', display: 'block' }}
                            />
                          ) : (
                            <div className="no-thumbnail">No img</div>
                          )}
                        </td>
                        <td>{new Date(item.created_at).toLocaleDateString()}</td>
                        <td className="title-cell">{item.title?.replace(/\*\*/g, '').substring(0, 50)}...</td>
                        <td>{item.focus_keyword?.replace(/\*\*/g, '')}</td>
                        <td className="sku-cell">{item.sku?.replace(/\*\*/g, '')}</td>
                        <td className="actions-cell">
                          <button className="view-btn" onClick={(e) => { e.stopPropagation(); viewListing(item); }}>View</button>
                          <button className="delete-btn" onClick={(e) => deleteListing(item.id, e)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Handsole Content Generator</p>
      </footer>
    </div>
  );
}

export default App;
