/**
 * NEXUS — i18n strings.
 *
 * Keys are namespaced by surface: common.* | nav.* | seller.* | buyer.* | founder.*
 * Hindi is the pilot translation; other locales are empty and fall back to en.
 * Adding a language is data work in this file, no code changes needed.
 *
 * Translation principles for Hindi (and any Indic language):
 *   - Use clear, conversational register, NOT government/legalese Hindi
 *   - Numbers and currency stay in Indian format (₹, lakh, crore)
 *   - Technical terms (GST, KYC, UPI) stay as recognized abbreviations
 *   - Tone is respectful but not formal; an artisan should feel addressed,
 *     not lectured
 */

'use strict';

const en = {
  // common
  'common.confirm':            'Confirm',
  'common.cancel':             'Cancel',
  'common.next':               'Next',
  'common.back':               'Back',
  'common.loading':            'Loading…',
  'common.save':               'Save',
  'common.send':               'Send',
  'common.close':              'Close',
  'common.yes':                'Yes',
  'common.no':                 'No',
  'common.optional':           'Optional',
  'common.required':           'Required',
  'common.language':           'Language',

  // navigation (seller)
  'nav.overview':              'Overview',
  'nav.products':              'My products',
  'nav.orders':                'Orders',
  'nav.payouts':               'Payouts',
  'nav.help':                  'Help',
  'nav.settings':              'Settings',

  // seller onboarding (one of the 4 critical screens)
  'seller.onboard.title':                'Tell us about yourself',
  'seller.onboard.subtitle':             'A few simple questions. We will set up the right account for you.',
  'seller.onboard.name.label':           'Your name',
  'seller.onboard.name.placeholder':     'e.g. Ramvati Devi',
  'seller.onboard.has_voter_id':         'Do you have a Voter ID card?',
  'seller.onboard.has_aadhaar':          'Do you have an Aadhaar card?',
  'seller.onboard.has_gstin':            'Do you have a GSTIN (business GST number)?',
  'seller.onboard.has_bank':             'Do you have a bank account?',
  'seller.onboard.language':             'Which language do you speak?',
  'seller.onboard.assign_model':         'Set up my account',
  'seller.onboard.assigned_mor':         'Account ready. NEXUS will be the seller of record. We handle GST and customs. You make and ship; we do the paperwork.',
  'seller.onboard.assigned_saas':        'Account ready. You stay the seller of record. NEXUS prepares your filings; you sign off.',
  'seller.onboard.assigned_umbrella':    'Account ready. You join the cooperative umbrella; each member is paid directly.',
  'seller.onboard.assigned_agent':       'Account ready. NEXUS acts as your booking agent; you carry the operator licence and insurance.',
  'seller.onboard.assigned_blocked':     'Sorry — we cannot open an account without a guardian for someone under 18.',

  // seller listings (2nd critical screen)
  'seller.products.title':               'My products',
  'seller.products.empty':               'No products yet. Add your first product to start selling.',
  'seller.products.add':                 'Add a product',
  'seller.products.add.title':           'Add a product',
  'seller.products.add.name':            'Product name',
  'seller.products.add.name.placeholder': 'e.g. Khurja blue pottery vase',
  'seller.products.add.supplier_price':  'Your price (₹)',
  'seller.products.add.sell_price':      'Selling price (₹)',
  'seller.products.add.vertical':        'Category',
  'seller.products.add.region':          'Where is it made? (city, state)',
  'seller.products.add.craft':           'Technique used',
  'seller.products.add.story':           'A short story about how you make this',
  'seller.products.add.materials':       'Materials',
  'seller.products.add.dimensions':      'Size / dimensions',
  'seller.products.add.handmade':        'This product is handmade',
  'seller.products.add.save':            'List this product',
  'seller.products.add.saved':           'Listed! Buyers can now see and order this.',
  'seller.products.add.voice_hint':      'You can also press the mic and describe the product in your own voice.',
  'seller.products.gi_verified':         'GI verified',
  'seller.products.gi_unverified':       'GI matched but region missing',
  'seller.products.gi_suspicious':       'GI mismatch — region does not match',

  // seller orders (3rd critical screen)
  'seller.orders.title':                 'Orders',
  'seller.orders.empty':                 'No orders yet.',
  'seller.orders.status.placed':         'Placed',
  'seller.orders.status.held':           'Held for review',
  'seller.orders.status.settled':        'Settled',
  'seller.orders.status.packed':         'Packed',
  'seller.orders.status.shipped':        'Shipped',
  'seller.orders.status.delivered':      'Delivered',
  'seller.orders.status.returned':       'Returned',
  'seller.orders.buyer':                 'Buyer',
  'seller.orders.amount':                'Amount',
  'seller.orders.your_share':            'Your share',
  'seller.orders.expected_payout':       'Payout reaches your bank in T+2 (about 2 working days)',
  'seller.orders.print_label':           'Print shipping label',

  // seller payouts (4th critical screen)
  'seller.payouts.title':                'Payouts',
  'seller.payouts.balance':              'Balance',
  'seller.payouts.next_payout':          'Next payout',
  'seller.payouts.recent':               'Recent payouts',
  'seller.payouts.bank_account':         'Bank account',
  'seller.payouts.no_payouts':           'No payouts yet. Your first payout will appear here once an order settles.',
  'seller.payouts.platform_never_holds': 'NEXUS never holds your money. Payments split at the gateway and reach your bank directly.',

  // buyer storefront (top-level)
  'buyer.hero.tagline':                  'Verified-real craft from the artisan, not the middleman.',
  'buyer.hero.cta':                      'Browse the catalog',
  'buyer.modality.d2c':                  'For myself',
  'buyer.modality.b2b':                  'For my shop (bulk)',
  'buyer.modality.exim':                 'Shipping abroad',
  'buyer.modality.pos':                  'In person',
  'buyer.cart.add':                      'Add to cart',
  'buyer.cart.add_quote':                'Add to quote',
  'buyer.cart.empty':                    'Your cart is empty.',
  'buyer.cart.checkout':                 'Checkout',
  'buyer.trust.gi_verified':             'GI verified · {gi}',
  'buyer.trust.where_money_goes':        'On a ₹{total} sale, ₹{toMaker} reaches the maker in T+2.',

  // language picker
  'lang.title':                          'Choose your language',
  'lang.changed':                        'Language changed.',
};

const hi = {
  // common
  'common.confirm':            'पक्का',
  'common.cancel':             'रद्द करें',
  'common.next':               'आगे',
  'common.back':               'पीछे',
  'common.loading':            'लोड हो रहा है…',
  'common.save':               'सेव करें',
  'common.send':               'भेजें',
  'common.close':              'बंद करें',
  'common.yes':                'हाँ',
  'common.no':                 'नहीं',
  'common.optional':           'ज़रूरी नहीं',
  'common.required':           'ज़रूरी',
  'common.language':           'भाषा',

  // navigation
  'nav.overview':              'मुख्य पन्ना',
  'nav.products':              'मेरे उत्पाद',
  'nav.orders':                'ऑर्डर',
  'nav.payouts':               'पैसा मिला',
  'nav.help':                  'मदद',
  'nav.settings':              'सेटिंग',

  // seller onboarding
  'seller.onboard.title':                'अपने बारे में बताइए',
  'seller.onboard.subtitle':             'कुछ आसान सवाल। हम आपके लिए सही खाता खोल देंगे।',
  'seller.onboard.name.label':           'आपका नाम',
  'seller.onboard.name.placeholder':     'जैसे रामवती देवी',
  'seller.onboard.has_voter_id':         'क्या आपके पास वोटर आईडी है?',
  'seller.onboard.has_aadhaar':          'क्या आपके पास आधार कार्ड है?',
  'seller.onboard.has_gstin':            'क्या आपके पास GSTIN (कारोबार का जीएसटी नंबर) है?',
  'seller.onboard.has_bank':             'क्या आपके पास बैंक खाता है?',
  'seller.onboard.language':             'आप कौन सी भाषा बोलती हैं?',
  'seller.onboard.assign_model':         'मेरा खाता तैयार करें',
  'seller.onboard.assigned_mor':         'खाता तैयार है। NEXUS विक्रेता बनकर सब काम करेगा — GST, कस्टम। आप बनाइए और भेजिए; कागज़ी काम हम करेंगे।',
  'seller.onboard.assigned_saas':        'खाता तैयार है। आप विक्रेता रहेंगे। NEXUS आपके रिटर्न तैयार करेगा; आप साइन करेंगे।',
  'seller.onboard.assigned_umbrella':    'खाता तैयार है। आप सहकारी समिति से जुड़ गए हैं; हर सदस्य को सीधा भुगतान मिलेगा।',
  'seller.onboard.assigned_agent':       'खाता तैयार है। NEXUS आपका बुकिंग एजेंट है; ऑपरेटर लाइसेंस और बीमा आपके पास रहेगा।',
  'seller.onboard.assigned_blocked':     'माफ़ कीजिए — 18 साल से कम उम्र वालों के लिए हम बिना अभिभावक खाता नहीं खोल सकते।',

  // seller listings
  'seller.products.title':               'मेरे उत्पाद',
  'seller.products.empty':               'अभी कोई उत्पाद नहीं। बेचना शुरू करने के लिए पहला उत्पाद जोड़ें।',
  'seller.products.add':                 'उत्पाद जोड़ें',
  'seller.products.add.title':           'उत्पाद जोड़ें',
  'seller.products.add.name':            'उत्पाद का नाम',
  'seller.products.add.name.placeholder': 'जैसे खुर्जा नीला मटका',
  'seller.products.add.supplier_price':  'आपकी कीमत (₹)',
  'seller.products.add.sell_price':      'बिक्री कीमत (₹)',
  'seller.products.add.vertical':        'श्रेणी',
  'seller.products.add.region':          'कहाँ बनाया गया है? (शहर, राज्य)',
  'seller.products.add.craft':           'कौन सी कला है?',
  'seller.products.add.story':           'आप इसे कैसे बनाती हैं, थोड़ा बताइए',
  'seller.products.add.materials':       'सामग्री',
  'seller.products.add.dimensions':      'आकार / नाप',
  'seller.products.add.handmade':        'यह उत्पाद हाथ से बना है',
  'seller.products.add.save':            'उत्पाद को सूची में डालें',
  'seller.products.add.saved':           'सूची में डाल दिया गया! अब खरीदार इसे देख और मँगा सकते हैं।',
  'seller.products.add.voice_hint':      'आप माइक दबाकर अपनी आवाज़ में भी बता सकती हैं।',
  'seller.products.gi_verified':         'GI प्रमाणित',
  'seller.products.gi_unverified':       'GI मिला, पर राज्य नहीं भरा गया',
  'seller.products.gi_suspicious':       'GI में गड़बड़ी — राज्य मेल नहीं खा रहा',

  // seller orders
  'seller.orders.title':                 'ऑर्डर',
  'seller.orders.empty':                 'अभी कोई ऑर्डर नहीं आया।',
  'seller.orders.status.placed':         'ऑर्डर मिला',
  'seller.orders.status.held':           'जाँच के लिए रुका',
  'seller.orders.status.settled':        'पैसा मिल गया',
  'seller.orders.status.packed':         'पैक हो गया',
  'seller.orders.status.shipped':        'भेज दिया गया',
  'seller.orders.status.delivered':      'पहुँच गया',
  'seller.orders.status.returned':       'वापस आ गया',
  'seller.orders.buyer':                 'खरीदार',
  'seller.orders.amount':                'कुल रकम',
  'seller.orders.your_share':            'आपका हिस्सा',
  'seller.orders.expected_payout':       'पैसा आपके बैंक में T+2 (लगभग 2 कामकाजी दिन) में पहुँच जाएगा',
  'seller.orders.print_label':           'भेजने का लेबल प्रिंट करें',

  // seller payouts
  'seller.payouts.title':                'पैसा मिला',
  'seller.payouts.balance':              'जमा',
  'seller.payouts.next_payout':          'अगला भुगतान',
  'seller.payouts.recent':               'हाल के भुगतान',
  'seller.payouts.bank_account':         'बैंक खाता',
  'seller.payouts.no_payouts':           'अभी कोई भुगतान नहीं। पहले ऑर्डर के बाद यहाँ आपको पैसा दिखेगा।',
  'seller.payouts.platform_never_holds': 'NEXUS आपका पैसा कभी अपने पास नहीं रखता। गेटवे पर बँटाई होती है और सीधा आपके बैंक में जाता है।',

  // buyer storefront
  'buyer.hero.tagline':                  'कारीगर से सीधा, बीच में कोई नहीं — असली, प्रमाणित कला।',
  'buyer.hero.cta':                      'कैटलॉग देखें',
  'buyer.modality.d2c':                  'अपने लिए',
  'buyer.modality.b2b':                  'मेरी दुकान के लिए (थोक)',
  'buyer.modality.exim':                 'विदेश भेजना',
  'buyer.modality.pos':                  'दुकान पर',
  'buyer.cart.add':                      'कार्ट में डालें',
  'buyer.cart.add_quote':                'भाव माँगें',
  'buyer.cart.empty':                    'आपका कार्ट खाली है।',
  'buyer.cart.checkout':                 'भुगतान करें',
  'buyer.trust.gi_verified':             'GI प्रमाणित · {gi}',
  'buyer.trust.where_money_goes':        '₹{total} की बिक्री पर ₹{toMaker} कारीगर तक T+2 में पहुँचता है।',

  // language picker
  'lang.title':                          'अपनी भाषा चुनें',
  'lang.changed':                        'भाषा बदल दी गई।',
};

const TABLES = {
  en, hi,
  // Other priority languages declared but empty — they fall back to en
  // until translations land. This is honest: usable in any language,
  // properly localized in pilot languages.
  bn: {}, ta: {}, te: {}, mr: {}, gu: {}, kn: {}, ml: {}, pa: {}, or: {}, as: {}, ur: {},
};

module.exports = { TABLES };
