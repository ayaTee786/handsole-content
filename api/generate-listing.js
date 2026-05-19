// Vercel Serverless Function - 60 second timeout on free tier
export const config = {
  maxDuration: 60, // 60 seconds max on Vercel free tier
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, additionalColors, customNotes } = req.body;

    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    // Use first image only for speed
    const imageContent = [{
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: images[0]
      }
    }];

    const systemPrompt = `You are Handsole's Etsy listing expert. Generate comprehensive, SEO-optimized listings for handmade leather men's shoes.

BRAND SPECIFICATIONS:
• Upper: Premium full-grain cow crust/aniline leather
• Lining: Anti-bacterial sweat-absorbing breathable goat leather (observe color from image: tan, burgundy/red, or black)
• Sole: Handmade vegetable tan burnished leather with rubber insert for grip
• Heels: 1-inch staked vegetable tan leather with rubber heel caps
• Footbed: Quilted and padded cushion insole for luxury comfort
• Sizes: US 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5
• Widths: E (narrow), F (standard), G (wide), H (extra wide)
• Lasts: 101 Edward (narrow almond), 201 Henry (semi-square), 301 Arthur (round), 401 Winston (apron)
• Production: 3-10 working days
• Shipping: FREE worldwide shipping
• Returns: 30-day returns, free size exchanges

ETSY 2025 SEO RULES (CRITICAL):
1. Title: Maximum 140 characters - put PRODUCT + COLOR first, include "for Men", use | for separation
2. NEVER use: luxury, premium, beautiful, perfect, elegant, stunning, or brand name
3. 13 tags maximum, each under 20 characters, ALL must be unique
4. First 160 characters of description = SEO hook with focus keyword
5. Use • bullets ONLY (never use ✦ symbol)
6. Extensive keyword stuffing throughout description (1.5% density)
7. Production time: 3-10 working days (NOT "How to Order" section)

HIGH-VOLUME KEYWORDS TO INCORPORATE:
Styles: oxford shoes, derby shoes, loafer shoes, monk strap shoes, chelsea boots, mule shoes, brogue shoes, wingtip shoes, wholecut oxford, cap toe, apron toe
Materials: leather shoes, suede shoes, croc embossed, full grain leather, hand welted, hand lasted, handmade shoes, custom shoes, bespoke shoes
Occasions: wedding shoes groom, groomsmen gift, business formal, office wear, dress shoes for men, formal shoes
Search terms: mens dress shoes (33.1k), mens oxford shoes, mens loafers, slip on dress shoes

OUTPUT FORMAT - PROVIDE ALL SECTIONS WITH EXACT HEADERS:

## PRODUCT ANALYSIS
| Attribute | Value |
|-----------|-------|
| Style | [oxford/derby/loafer/monk strap/chelsea/mule/etc.] |
| Toe Shape | [round/almond/square/pointed/apron/moc toe] |
| Closure | [laces/single buckle/double buckle/slip-on/elastic gore] |
| Upper Material | [smooth leather/suede/croc embossed/pebbled grain/patent] |
| Pattern | [plain/cap toe/wingtip brogue/full brogue/medallion/wholecut] |
| Main Color | [exact color observed] |
| Secondary Color | [if two-tone, otherwise N/A] |
| Patina/Finish | [hand-painted patina/burnished/matte/polished] |
| Lining Color | [tan/burgundy/red/black - from image] |
| Hardware | [brass buckles/silver buckles/gold bit/none] |
| Sole Visible | [leather/rubber/combination] |
| Special Details | [broguing/stitching/welt/pull tabs/elastic] |

## FOCUS KEYWORD
[Single phrase that best defines this product for Etsy search]

## SUPPORTING KEYWORDS
| Keyword | Etsy Market Valid | Est. Monthly Volume |
|---------|-------------------|---------------------|
| [keyword 1] | ✓ | [volume] |
| [keyword 2] | ✓ | [volume] |
[Include 5-8 supporting keywords]

## ETSY TITLE
[Maximum 140 characters, product+color FIRST, includes "for Men", uses | separators, NO subjective words]

## ETSY 13 TAGS
[Comma-separated, all unique, each under 20 characters, no exact title repeats]

## DESCRIPTION
[700-900 words comprehensive description with:
- SEO hook in first 160 characters with focus keyword
- Features section with • bullets
- Materials & Construction section
- Sizing & Fit Guide
- Care Instructions (link to https://thehangerproject.com/pages/shoe-care-guide for leather or https://thehangerproject.com/pages/suede-care for suede)
- Shipping & Production info
- Extensive keyword usage throughout
- End with: "AI-generated draft – review and personalize before listing!"]

## ETSY ATTRIBUTES
• Category: Shoes > Men's Shoes > [Oxfords/Loafers/Boots/etc.]
• Primary Color: [main color]
• Secondary Color: [if applicable]
• Material: Leather
• Style: [style name]
• Closure: [closure type]
• Sole Material: Leather
• Occasion: [Formal, Business, Wedding, Casual]
• Handmade: Yes
• Made to Order: Yes
• Customizable: Yes (sizing, width)

## IMAGE ALT TEXTS
[Comma-separated, keyword-rich alt texts for each image angle]

## IMAGE FILE NAMES
[Lowercase with hyphens, keyword-rich, .jpg format]

## SKU
[Format: HS-STYLE-SUBSTYLE-COLOR-001, e.g., HS-OXF-WINGTIP-BLK-001]

## SHOP CATEGORY
[Single category line for Etsy shop organization]

## BEST OCCASIONS
[Comma-separated list of occasions]

## KEYWORDS USED COUNT
| Keyword | Times Used |
|---------|------------|
[Show count of major keywords in description]`;

    let userPrompt = `Analyze the uploaded shoe image(s) and generate a COMPLETE, COMPREHENSIVE Etsy listing package.

CRITICAL - EXAMINE THE IMAGE CAREFULLY:
1. Identify the EXACT shoe style (oxford, derby, loafer, monk strap, chelsea boot, mule, etc.)
2. Note the toe shape (round, almond, square, pointed, apron/moc toe)
3. Identify closure type (laces, buckles, slip-on, elastic)
4. Determine the EXACT material (smooth leather, suede, croc embossed, pebbled grain, patent)
5. Note ALL colors visible - DO NOT default to cognac or assume!
6. Check the lining color visible inside the shoe (tan, burgundy/red, or black)
7. Identify any hardware (buckles, bits, decorative elements)
8. Note special details (patina finish, broguing, stitching, welting)

DESCRIBE EXACTLY WHAT YOU SEE - never assume or default to common colors!`;

    if (additionalColors) {
      userPrompt += `\n\nADDITIONAL COLORS AVAILABLE: ${additionalColors}`;
    }

    if (customNotes) {
      userPrompt += `\n\nSELLER CUSTOM NOTES: ${customNotes}`;
    }

    userPrompt += `\n\nGenerate the COMPLETE listing package with ALL sections. Be thorough and extensive with keywords throughout the description. This must be copy-paste ready for Etsy.`;

    console.log('Calling Claude API...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [...imageContent, { type: 'text', text: userPrompt }]
        }]
      })
    });

    console.log('API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API error:', JSON.stringify(errorData));
      return res.status(500).json({ error: 'AI generation failed', details: errorData });
    }

    const data = await response.json();
    console.log('Got response from Claude');
    
    const aiResponse = data.content[0].text;
    const listing = parseListingResponse(aiResponse);

    return res.status(200).json(listing);

  } catch (error) {
    console.error('Function error:', error.message);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}

function parseListingResponse(response) {
  const sections = {
    productAnalysis: extractSection(response, 'PRODUCT ANALYSIS'),
    focusKeyword: extractSection(response, 'FOCUS KEYWORD'),
    supportingKeywords: extractSection(response, 'SUPPORTING KEYWORDS'),
    title: extractSection(response, 'ETSY TITLE'),
    tags: extractSection(response, 'ETSY 13 TAGS'),
    description: extractSection(response, 'DESCRIPTION'),
    attributes: extractSection(response, 'ETSY ATTRIBUTES'),
    altTexts: extractSection(response, 'IMAGE ALT TEXTS'),
    fileNames: extractSection(response, 'IMAGE FILE NAMES'),
    sku: extractSection(response, 'SKU'),
    shopCategory: extractSection(response, 'SHOP CATEGORY'),
    occasions: extractSection(response, 'BEST OCCASIONS'),
    keywordsUsed: extractSection(response, 'KEYWORDS USED COUNT')
  };

  Object.keys(sections).forEach(key => {
    sections[key] = sections[key]?.trim() || 'Not generated - please retry';
  });

  return sections;
}

function extractSection(text, sectionName) {
  const regex = new RegExp(`##\\s*${sectionName}[:\\s]*([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() || null;
}
