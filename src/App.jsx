import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

const compressForAPI = (file, maxSize = 1024) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

const generateThumbnail = (file, maxSize = 80) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

const cleanText = (text) => text?.replace(/\*\*/g, '').replace(/-{3,}/g, '').trim() || '';

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('signin');
  const [authEmail, setAuthEmail] = useState(() => localStorage.getItem('hs_saved_email') || '');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('hs_saved_email'));

  const [images, setImages] = useState([]);
  const [imageBase64s, setImageBase64s] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);
  const [productDetails, setProductDetails] = useState({ additionalColors: '', customNotes: '' });
  const [gender, setGender] = useState('men');
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('generate');
  const [copiedSection, setCopiedSection] = useState(null);
  const [selectedListing, setSelectedListing] = useState(null);

  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsFilter, setListingsFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const [duplicateWarning, setDuplicateWarning] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) fetchListings(); }, [session]);

  const fetchListings = async () => {
    setListingsLoading(true);
    try {
      const { data, error } = await supabase
        .from('listings').select('*')
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

  const filteredListings = useMemo(() => {
    return listings.filter(item => {
      const matchesGender = listingsFilter === 'all' || (item.gender || 'men') === listingsFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        item.title?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.focus_keyword?.toLowerCase().includes(q);
      return matchesGender && matchesSearch;
    });
  }, [listings, listingsFilter, searchQuery]);

  useEffect(() => { setCurrentPage(1); }, [listingsFilter, searchQuery]);

  const totalPages = Math.ceil(filteredListings.length / perPage);
  const paginatedListings = filteredListings.slice((currentPage - 1) * perPage, currentPage * perPage);

  const computeImageHash = async (base64String) => {
    const data = new TextEncoder().encode(base64String.substring(0, 3000));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
  };

  const checkImageHash = async (hash) => {
    const { data } = await supabase.from('listings')
      .select('id, title, focus_keyword, sku, gender')
      .eq('user_id', session.user.id)
      .eq('image_hash', hash);
    return data || [];
  };

  const checkForDuplicates = async (focusKeyword) => {
    if (!focusKeyword) return [];
    const words = focusKeyword.toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(' ').filter(w => w.length > 2).slice(0, 3).join(' ');
    if (!words) return [];
    const { data } = await supabase.from('listings').select('id, title, focus_keyword, sku, gender')
      .eq('user_id', session.user.id).ilike('focus_keyword', `%${words}%`);
    return data || [];
  };

  const performSave = async (data, thumbnail, genderVal, imageHash = null) => {
    const { error: insertError } = await supabase.from('listings').insert({
      user_id: session.user.id,
      thumbnail,
      gender: genderVal,
      image_hash: imageHash,
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
    if (insertError) console.error('Error saving listing:', insertError);
    else fetchListings();
  };

  const handleSignIn = async (e) => {
    e.preventDefault(); setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) throw error;
      rememberMe ? localStorage.setItem('hs_saved_email', authEmail) : localStorage.removeItem('hs_saved_email');
    } catch (err) { setAuthError(err.message); }
  };

  const handleSignUp = async (e) => {
    e.preventDefault(); setAuthError(null);
    try {
      const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (error) throw error;
      setAuthError('Check your email for confirmation link!');
    } catch (err) { setAuthError(err.message); }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setListings([]); setListing(null); setSelectedListing(null);
  };

  const handleImageUpload = useCallback((e) => {
    const files = Array.from(e.target.files || e.dataTransfer?.files || []);
    const newImages = [], newBase64s = [], newFiles = [];
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
    if (imageBase64s.length === 0) { setError('Please upload at least one product image'); return; }
    setLoading(true); setError(null); setDuplicateWarning(null);
    try {
      const compressedImages = await Promise.all(imageFiles.map(f => compressForAPI(f)));
      const imageHash = await computeImageHash(compressedImages[0]);
      const hashDupes = await checkImageHash(imageHash);
      if (hashDupes.length > 0) {
        setDuplicateWarning({ type: 'image', matches: hashDupes, pendingCompressed: compressedImages, pendingHash: imageHash, pendingGender: gender });
        setLoading(false);
        return;
      }
      await callAPIAndSave(compressedImages, imageHash);
    } catch (err) {
      setError(err.name === 'AbortError' ? 'Request timed out. Please try again.' : err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const callAPIAndSave = async (compressedImages, imageHash) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    const response = await fetch('/api/generate-listing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: compressedImages, additionalColors: productDetails.additionalColors, customNotes: productDetails.customNotes, gender }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed to generate listing'); }
    const data = await response.json();
    setListing(data);
    const thumbnail = imageFiles[0] ? await generateThumbnail(imageFiles[0]) : null;
    const keywordDupes = await checkForDuplicates(data.focusKeyword);
    if (keywordDupes.length > 0) {
      setDuplicateWarning({ type: 'keyword', matches: keywordDupes, pendingListing: data, pendingThumbnail: thumbnail, pendingHash: imageHash, pendingGender: gender });
      setActiveTab('result');
      return;
    }
    await performSave(data, thumbnail, gender, imageHash);
    setActiveTab('result');
  };

  const handleGenerateAnyway = async () => {
    if (!duplicateWarning) return;
    const { pendingCompressed, pendingHash } = duplicateWarning;
    setDuplicateWarning(null);
    setLoading(true);
    try { await callAPIAndSave(pendingCompressed, pendingHash); }
    catch (err) { setError(err.message || 'An error occurred'); }
    finally { setLoading(false); }
  };

  const handleSaveAnyway = async () => {
    if (!duplicateWarning) return;
    await performSave(duplicateWarning.pendingListing, duplicateWarning.pendingThumbnail, duplicateWarning.pendingGender, duplicateWarning.pendingHash);
    setDuplicateWarning(null);
  };

  const handleDiscard = () => {
    setDuplicateWarning(null);
    setListing(null);
    setActiveTab('generate');
  };

  const viewListing = (item) => {
    setSelectedListing(item);
    setListing({
      productAnalysis: item.product_analysis, focusKeyword: item.focus_keyword,
      supportingKeywords: item.supporting_keywords, title: item.title, tags: item.tags,
      description: item.description, attributes: item.attributes, altTexts: item.alt_texts,
      fileNames: item.file_names, sku: item.sku, shopCategory: item.shop_category,
      occasions: item.occasions, keywordsUsed: item.keywords_used
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
      if (selectedListing?.id === id) { setSelectedListing(null); setListing(null); }
    } catch (err) { console.error('Error deleting:', err); }
  };

  const copyToClipboard = async (text, section) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) { console.error('Failed to copy:', err); }
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
            {authMode === 'signin' && (
              <div className="remember-me">
                <label>
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  Remember me
                </label>
              </div>
            )}
            <button type="submit" className="auth-submit">{authMode === 'signin' ? 'Sign In' : 'Create Account'}</button>
          </form>
        </div>
      </div>
    );
  }

  const menCount = listings.filter(l => (l.gender || 'men') === 'men').length;
  const womenCount = listings.filter(l => l.gender === 'women').length;

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

        {/* GENERATE TAB */}
        {activeTab === 'generate' && (
          <div className="generate-section">
            <div className="section-header">
              <h2>Generate New Listing</h2>
              <div className="gender-toggle">
                <button className={gender === 'men' ? 'active' : ''} onClick={() => setGender('men')}>Men's Shoes</button>
                <button className={gender === 'women' ? 'active' : ''} onClick={() => setGender('women')}>Women's Shoes</button>
              </div>
            </div>
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
            {duplicateWarning?.type === 'image' && (
              <div className="duplicate-warning">
                <div className="dupe-icon">🛑</div>
                <div className="dupe-content">
                  <strong>Same image already has a listing</strong>
                  <p>This exact image was used before. No tokens spent yet.</p>
                  <div className="dupe-matches">
                    {duplicateWarning.matches.map(m => (
                      <div key={m.id} className="dupe-match">
                        <span className={`gender-badge ${m.gender || 'men'}`}>{(m.gender || 'men') === 'men' ? 'M' : 'W'}</span>
                        <span className="dupe-sku">{cleanText(m.sku)}</span>
                        <span className="dupe-title">{m.title?.substring(0, 55)}...</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="dupe-actions">
                  <button className="dupe-save" onClick={handleGenerateAnyway}>Generate Anyway</button>
                  <button className="dupe-discard" onClick={() => setDuplicateWarning(null)}>Cancel</button>
                </div>
              </div>
            )}
            <button className="generate-btn" onClick={generateListing} disabled={loading || images.length === 0}>
              {loading ? <><span className="spinner"></span>Generating...</> : 'Generate Listing'}
            </button>
          </div>
        )}

        {/* RESULT TAB */}
        {activeTab === 'result' && listing && (
          <div className="result-section">
            {duplicateWarning?.type === 'keyword' && (
              <div className="duplicate-warning">
                <div className="dupe-icon">⚠️</div>
                <div className="dupe-content">
                  <strong>Similar listing already exists</strong>
                  <p>{duplicateWarning.matches.length} similar listing(s) found in your library:</p>
                  <div className="dupe-matches">
                    {duplicateWarning.matches.map(m => (
                      <div key={m.id} className="dupe-match">
                        <span className={`gender-badge ${m.gender || 'men'}`}>{(m.gender || 'men') === 'men' ? 'M' : 'W'}</span>
                        <span className="dupe-sku">{cleanText(m.sku)}</span>
                        <span className="dupe-title">{m.title?.substring(0, 55)}...</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="dupe-actions">
                  <button className="dupe-save" onClick={handleSaveAnyway}>Save Anyway</button>
                  <button className="dupe-discard" onClick={handleDiscard}>Discard</button>
                </div>
              </div>
            )}
            <div className="section-header">
              <div className="result-breadcrumb">
                <span className="breadcrumb-link" onClick={() => setActiveTab('listings')}>All Listings</span>
                <span className="breadcrumb-sep">›</span>
                <span>{selectedListing ? cleanText(selectedListing.sku) : 'New Result'}</span>
              </div>
              <div className="section-actions">
                <button className="action-btn" onClick={downloadListing}>Download</button>
                <button className="action-btn primary" onClick={() => { setActiveTab('generate'); setListing(null); setSelectedListing(null); setImages([]); setImageBase64s([]); setImageFiles([]); setGender('men'); setDuplicateWarning(null); }}>+ New Listing</button>
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

        {/* LISTINGS TAB */}
        {activeTab === 'listings' && (
          <div className="listings-section">
            <div className="listings-toolbar">
              <div className="listings-toolbar-left">
                <div className="filter-tabs">
                  <button className={listingsFilter === 'all' ? 'active' : ''} onClick={() => setListingsFilter('all')}>
                    All <span className="filter-count">{listings.length}</span>
                  </button>
                  <button className={listingsFilter === 'men' ? 'active' : ''} onClick={() => setListingsFilter('men')}>
                    Men's <span className="filter-count">{menCount}</span>
                  </button>
                  <button className={listingsFilter === 'women' ? 'active' : ''} onClick={() => setListingsFilter('women')}>
                    Women's <span className="filter-count">{womenCount}</span>
                  </button>
                </div>
              </div>
              <div className="listings-toolbar-right">
                <div className="search-box">
                  <span className="search-icon">🔍</span>
                  <input type="text" placeholder="Search title, SKU, keyword..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  {searchQuery && <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>}
                </div>
                <span className="results-count">{filteredListings.length} results</span>
              </div>
            </div>

            {listingsLoading ? (
              <div className="loading-state"><div className="spinner"></div><p>Loading listings...</p></div>
            ) : listings.length === 0 ? (
              <div className="empty-state">
                <p>No listings yet</p>
                <button onClick={() => setActiveTab('generate')}>Generate your first listing</button>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="empty-state"><p>No listings match your search</p></div>
            ) : (
              <>
                <div className="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th className="col-num">#</th>
                        <th className="col-img">IMG</th>
                        <th className="col-gender">TYPE</th>
                        <th className="col-date">DATE</th>
                        <th className="col-title">TITLE</th>
                        <th className="col-keyword">FOCUS KEYWORD</th>
                        <th className="col-sku">SKU</th>
                        <th className="col-actions">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedListings.map((item, index) => (
                        <tr key={item.id} onClick={() => viewListing(item)}>
                          <td className="col-num">{(currentPage - 1) * perPage + index + 1}</td>
                          <td className="col-img">
                            {item.thumbnail ? (
                              <img src={`data:image/jpeg;base64,${item.thumbnail}`} alt="" className="table-thumbnail" />
                            ) : (
                              <div className="no-thumbnail">—</div>
                            )}
                          </td>
                          <td className="col-gender">
                            <span className={`gender-badge ${item.gender || 'men'}`}>
                              {(item.gender || 'men') === 'men' ? 'MEN' : 'WMN'}
                            </span>
                          </td>
                          <td className="col-date">{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                          <td className="col-title">{cleanText(item.title).substring(0, 52)}{item.title?.length > 52 ? '…' : ''}</td>
                          <td className="col-keyword">{cleanText(item.focus_keyword).substring(0, 36)}{item.focus_keyword?.length > 36 ? '…' : ''}</td>
                          <td className="col-sku">{cleanText(item.sku)}</td>
                          <td className="col-actions" onClick={e => e.stopPropagation()}>
                            <button className="view-btn" onClick={() => viewListing(item)}>View</button>
                            <button className="delete-btn" onClick={(e) => deleteListing(item.id, e)}>Del</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pagination-bar">
                  <span className="pagination-info">
                    Showing {((currentPage - 1) * perPage) + 1}–{Math.min(currentPage * perPage, filteredListings.length)} of {filteredListings.length}
                  </span>
                  <div className="pagination-controls">
                    <button className="page-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹ Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i-1] > 1) acc.push('...'); acc.push(p); return acc; }, [])
                      .map((p, i) => p === '...'
                        ? <span key={`d${i}`} className="page-dots">…</span>
                        : <button key={p} className={`page-btn${p === currentPage ? ' active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
                      )
                    }
                    <button className="page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next ›</button>
                  </div>
                  <div className="pagination-perpage">
                    <label>Per page:</label>
                    <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={75}>75</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              </>
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
