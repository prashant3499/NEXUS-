'use strict';

/**
 * test-products.js
 *
 * Tests the seller product catalog module:
 *   - HSN auto-suggestion across craft categories
 *   - Validation: title, price bounds, archetype-specific (HSN for SaaS sellers)
 *   - State machine: every valid + invalid transition
 *   - createProduct + editProduct + transitionProduct
 *   - publicCatalog filtering
 */

const P = require('./src/products');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const KARIGAR = { id: 'seller_k1', archetype: 'karigar' };
const VYAPARI = { id: 'seller_v1', archetype: 'vyapari' };
const NIRYATAK = { id: 'seller_n1', archetype: 'niryatak' };

// ════════════════════════════════════════════════════════════
sec('HSN auto-suggest');
{
  a(P.suggestHsn('pottery').hsn === '6913',                        'pottery → 6913');
  a(P.suggestHsn('pottery').gst_rate === 12,                       'pottery at 12% GST');
  a(P.suggestHsn('Block Printing').hsn === '5208',                  'block printing (case + space)');
  a(P.suggestHsn('madhubani').hsn === '9701',                       'madhubani painting');
  a(P.suggestHsn('jewellery-gold').hsn === '7113',                  'jewellery (hyphen handled)');
  a(P.suggestHsn('jewellery_gold').gst_rate === 3,                  'jewellery at 3%');
  a(P.suggestHsn('diamonds').gst_rate === 0.25,                     'diamonds at 0.25%');
  a(P.suggestHsn('honey').gst_rate === 0,                           'natural honey zero-rated');
  a(P.suggestHsn('soap').gst_rate === 18,                           'soap at 18%');
  a(P.suggestHsn('unknown_craft') === null,                         'Unknown craft returns null');
  a(P.suggestHsn('') === null,                                      'Empty string returns null');
  a(P.suggestHsn(null) === null,                                    'null returns null');
}

// ════════════════════════════════════════════════════════════
sec('Validation — basic fields');
{
  const base = { title: 'Khurja Vase', vertical: 'handicraft', price_paise: 158000 };
  a(P.validateProductInput(base, 'karigar').ok,                    'Basic valid input');
  a(!P.validateProductInput({ ...base, title: 'X' }, 'karigar').ok, 'Short title rejected');
  a(!P.validateProductInput({ ...base, title: 'a'.repeat(200) }, 'karigar').ok, 'Long title rejected');
  a(!P.validateProductInput({ ...base, vertical: 'fake' }, 'karigar').ok, 'Bad vertical rejected');
  a(!P.validateProductInput({ ...base, price_paise: 500 }, 'karigar').ok, 'Price below ₹10 rejected');
  a(!P.validateProductInput({ ...base, price_paise: 999999999 }, 'karigar').ok, 'Price above ₹5cr rejected');
  a(!P.validateProductInput({ ...base, price_paise: 1500.5 }, 'karigar').ok, 'Non-integer price rejected');
  a(!P.validateProductInput({ ...base, price_paise: '1500' }, 'karigar').ok, 'String price rejected');
}

sec('Validation — stock + photos');
{
  const base = { title: 'Vase', vertical: 'handicraft', price_paise: 158000 };
  a(P.validateProductInput({ ...base, stock: 0 }, 'karigar').ok,    'stock: 0 valid');
  a(P.validateProductInput({ ...base, stock: 50 }, 'karigar').ok,    'stock: 50 valid');
  a(!P.validateProductInput({ ...base, stock: -1 }, 'karigar').ok,    'negative stock rejected');
  a(!P.validateProductInput({ ...base, stock: 5.5 }, 'karigar').ok,    'fractional stock rejected');
  a(P.validateProductInput({ ...base, photos: ['https://example.com/x.jpg'] }, 'karigar').ok, 'photos: URL ok');
  a(P.validateProductInput({ ...base, photos: ['data:image/png;base64,abc=='] }, 'karigar').ok, 'photos: base64 ok');
  a(!P.validateProductInput({ ...base, photos: 'not-array' }, 'karigar').ok, 'photos not-array rejected');
  a(!P.validateProductInput({ ...base, photos: Array(15).fill('x') }, 'karigar').ok, 'too many photos rejected');
  a(!P.validateProductInput({ ...base, photos: [''] }, 'karigar').ok, 'empty photo string rejected');
}

sec('Validation — archetype-specific (HSN required for SaaS sellers)');
{
  const base = { title: 'Test', vertical: 'handicraft', price_paise: 158000 };
  // Karigar: HSN optional
  a(P.validateProductInput(base, 'karigar').ok,                     'Karigar without HSN ok (MoR)');
  // Vyapari: HSN required
  a(!P.validateProductInput(base, 'vyapari').ok,                     'Vyapari without HSN rejected');
  a(P.validateProductInput({ ...base, hsn: '6913' }, 'vyapari').ok,   'Vyapari with HSN ok');
  a(!P.validateProductInput({ ...base, hsn: '12' }, 'vyapari').ok,    'Bad HSN format rejected');
  a(!P.validateProductInput({ ...base, hsn: 'ABCD' }, 'vyapari').ok,  'Non-numeric HSN rejected');
  // Niryatak: HSN + export_eligible required
  a(!P.validateProductInput({ ...base, hsn: '6913' }, 'niryatak').ok, 'Niryatak without export_eligible rejected');
  a(P.validateProductInput({ ...base, hsn: '6913', export_eligible: true }, 'niryatak').ok, 'Niryatak with both ok');
  a(P.validateProductInput({ ...base, hsn: '6913', export_eligible: false }, 'niryatak').ok, 'export_eligible: false also valid');
}

// ════════════════════════════════════════════════════════════
sec('createProduct — happy path Karigar');
{
  const r = P.createProduct({
    title: 'Khurja blue pottery vase',
    description: 'Hand-thrown, glazed in cobalt blue. 8 inches tall.',
    vertical: 'handicraft',
    craft: 'pottery',
    price_paise: 158000,
    stock: 12,
    photos: ['data:image/jpeg;base64,/9j/abc=='],
  }, KARIGAR, { idGen: () => 'prod_test1', now: () => 1_700_000_000_000 });
  a(r.ok,                                                            'Created');
  a(r.product.id === 'prod_test1',                                    'ID assigned');
  a(r.product.status === 'draft',                                      'Starts in draft');
  a(r.product.seller_id === 'seller_k1',                               'seller_id set');
  a(r.product.seller_of_record === false,                              'Karigar is NOT seller of record (MoR)');
  a(r.product.hsn === '6913',                                          'HSN auto-suggested from craft');
  a(r.product.hsn_info.gst_rate === 12,                                'HSN info attached');
  a(r.product.history.length === 1,                                    'Initial history entry');
  a(r.product.created_via === 'form',                                  'Default creation method');
  // Frozen
  let mutationBlocked = false;
  try { r.product.title = 'hacked'; mutationBlocked = r.product.title !== 'hacked'; } catch (e) { mutationBlocked = true; }
  a(mutationBlocked,                                                   'Product record is frozen');
}

sec('createProduct — happy path Niryatak with export');
{
  const r = P.createProduct({
    title: 'Cut polished diamond — 0.5 carat',
    vertical: 'gems',
    craft: 'diamonds',
    price_paise: 45_00_000,   // ₹45,000 — within cap
    hsn: '7102',
    export_eligible: true,
    photos: ['url1', 'url2'],
  }, NIRYATAK, { idGen: () => 'prod_test2' });
  a(r.ok,                                                              'Niryatak product created');
  a(r.product.seller_of_record === true,                                'Niryatak IS seller of record');
  a(r.product.export_eligible === true,                                 'Export flag preserved');
  a(r.product.hsn === '7102',                                           'HSN preserved');
}

sec('createProduct — fails without seller');
{
  const r = P.createProduct({ title: 'X', vertical: 'handicraft', price_paise: 158000 }, null);
  a(!r.ok && /seller required/.test(r.errors[0]),                       'No seller rejected');
  
  const r2 = P.createProduct({ title: 'X', vertical: 'handicraft', price_paise: 158000 }, { id: 'x' });
  a(!r2.ok,                                                             'Seller without archetype rejected');
}

sec('createProduct — validation errors surfaced');
{
  const r = P.createProduct({
    title: 'X',  // too short
    vertical: 'bad',
    price_paise: 100,  // too low
  }, KARIGAR);
  a(!r.ok,                                                              'Multiple errors caught');
  a(r.errors.length >= 3,                                               'All errors reported');
}

// ════════════════════════════════════════════════════════════
sec('editProduct — happy path');
{
  const c1 = P.createProduct({
    title: 'Original', vertical: 'handicraft', price_paise: 158000, craft: 'pottery',
  }, KARIGAR, { idGen: () => 'p1' });
  const e = P.editProduct(c1.product, { title: 'Edited title', price_paise: 200000 }, KARIGAR);
  a(e.ok,                                                              'Edit succeeded');
  a(e.product.title === 'Edited title',                                 'Title updated');
  a(e.product.price_paise === 200000,                                   'Price updated');
  a(e.product.vertical === 'handicraft',                                'Vertical preserved');
  a(e.product.craft === 'pottery',                                      'Craft preserved');
  a(e.product.history.length === 2,                                     'History grew');
  a(c1.product.title === 'Original',                                    'Original unchanged (immutability)');
}

sec('editProduct — blocked on non-draft statuses');
{
  const c1 = P.createProduct({ title: 'X X X', vertical: 'handicraft', price_paise: 158000 }, KARIGAR, { idGen: () => 'p2' });
  const submitted = P.transitionProduct(c1.product, 'pending_review');
  const approved = P.transitionProduct(submitted.product, 'active');
  const e = P.editProduct(approved.product, { title: 'Edit attempt' }, KARIGAR);
  a(!e.ok,                                                              'Cannot edit active product');
  a(/cannot edit.*active/.test(e.errors[0]),                            'Clear error message');
}

sec('editProduct — wrong seller blocked');
{
  const c1 = P.createProduct({ title: 'X X X', vertical: 'handicraft', price_paise: 158000 }, KARIGAR, { idGen: () => 'p3' });
  const e = P.editProduct(c1.product, { title: 'Hacker' }, { id: 'seller_other', archetype: 'karigar' });
  a(!e.ok,                                                              'Other seller blocked');
  a(/different seller/.test(e.errors[0]),                                'Clear error message');
}

// ════════════════════════════════════════════════════════════
sec('canTransition — state machine');
{
  a(P.canTransition('draft', 'pending_review'),                          'draft → pending_review');
  a(P.canTransition('pending_review', 'active'),                          'pending_review → active');
  a(P.canTransition('pending_review', 'rejected'),                        'pending_review → rejected');
  a(P.canTransition('pending_review', 'draft'),                            'pending_review → draft (recall)');
  a(P.canTransition('active', 'sold_out'),                                 'active → sold_out');
  a(P.canTransition('sold_out', 'active'),                                 'sold_out → active (restock)');
  a(P.canTransition('rejected', 'draft'),                                  'rejected → draft (edit + resubmit)');
  
  a(!P.canTransition('draft', 'active'),                                   'draft → active blocked (must review)');
  a(!P.canTransition('draft', 'sold_out'),                                 'draft → sold_out blocked');
  a(!P.canTransition('active', 'pending_review'),                          'active → pending_review blocked');
  a(!P.canTransition('archived', 'active'),                                'archived is terminal');
  a(!P.canTransition('archived', 'draft'),                                 'archived: no exit');
  a(!P.canTransition('bogus', 'active'),                                   'Bogus from rejected');
  a(!P.canTransition('draft', 'bogus'),                                    'Bogus to rejected');
}

sec('transitionProduct — happy path full lifecycle');
{
  const c = P.createProduct({ title: 'Pottery vase', vertical: 'handicraft', price_paise: 158000 }, KARIGAR, { idGen: () => 'lc1' });
  const submitted = P.transitionProduct(c.product, 'pending_review', { note: 'Seller submitted' });
  a(submitted.ok && submitted.product.status === 'pending_review',         'Submitted for review');
  
  const approved = P.transitionProduct(submitted.product, 'active', { note: 'Founder approved' });
  a(approved.ok && approved.product.status === 'active',                    'Approved → active');
  a(approved.product.history.length === 3,                                  'History records each step');
  a(approved.product.history[2].note === 'Founder approved',                'Notes preserved');
  
  const soldOut = P.transitionProduct(approved.product, 'sold_out');
  a(soldOut.ok && soldOut.product.status === 'sold_out',                    'active → sold_out');
  
  const restock = P.transitionProduct(soldOut.product, 'active');
  a(restock.ok && restock.product.status === 'active',                       'sold_out → active (restock)');
  
  const archived = P.transitionProduct(restock.product, 'archived');
  a(archived.ok && archived.product.status === 'archived',                   'active → archived');
  
  const fromArchived = P.transitionProduct(archived.product, 'active');
  a(!fromArchived.ok,                                                       'Cannot un-archive');
}

sec('transitionProduct — rejection + resubmit');
{
  const c = P.createProduct({ title: 'Test product', vertical: 'handicraft', price_paise: 158000 }, KARIGAR, { idGen: () => 'rj1' });
  const submitted = P.transitionProduct(c.product, 'pending_review');
  const rejected = P.transitionProduct(submitted.product, 'rejected', { note: 'Photo unclear' });
  a(rejected.ok && rejected.product.status === 'rejected',                  'Rejected');
  
  // Seller can re-edit
  const edited = P.editProduct(rejected.product, { photos: ['better.jpg'] }, KARIGAR);
  a(edited.ok,                                                              'Can edit a rejected product');
  
  const toDraft = P.transitionProduct(edited.product, 'draft');
  a(toDraft.ok,                                                             'rejected → draft (resubmit cycle)');
  
  const resubmitted = P.transitionProduct(toDraft.product, 'pending_review');
  a(resubmitted.ok,                                                         'Can resubmit after edit');
}

// ════════════════════════════════════════════════════════════
sec('publicCatalog — filters correctly');
{
  function makeActive(opts) {
    const c = P.createProduct({
      title: 'Item', vertical: opts.vertical || 'handicraft', price_paise: 158000,
      stock: opts.stock,
      export_eligible: opts.exportFlag,
      hsn: '6913',
    }, opts.exportFlag != null ? NIRYATAK : KARIGAR);
    let p = c.product;
    // Walk to the desired status
    const path = opts.status === 'active' ? ['pending_review', 'active']
              : opts.status === 'pending_review' ? ['pending_review']
              : opts.status === 'draft' ? []
              : ['pending_review', 'active', opts.status];
    for (const next of path) {
      const t = P.transitionProduct(p, next);
      if (!t.ok) return null;
      p = t.product;
    }
    return p;
  }
  const map = new Map();
  const p1 = makeActive({ status: 'active', stock: 5 });
  const p2 = makeActive({ status: 'active', stock: 0 });            // out of stock
  const p3 = makeActive({ status: 'draft' });
  const p4 = makeActive({ status: 'pending_review' });
  const p5 = makeActive({ status: 'active', stock: 10, vertical: 'gems', exportFlag: true });
  const p6 = makeActive({ status: 'active', stock: 5, exportFlag: false });
  [p1, p2, p3, p4, p5, p6].filter(Boolean).forEach(p => map.set(p.id, p));

  const all = P.publicCatalog(map);
  a(all.length === 3,                                                       '3 active items with stock');

  const exports = P.publicCatalog(map, { exportOnly: true });
  a(exports.length === 1,                                                   '1 export-eligible item');
  a(exports[0].id === p5.id,                                                'Correct export item');

  const handicraftOnly = P.publicCatalog(map, { vertical: 'handicraft' });
  a(handicraftOnly.length === 2,                                            'Handicraft filter works');
}

sec('Any artisan can sell ALL product types (no vertical lock)');
{
  // A Karigar (lowest tier, undocumented artisan) must be able to list across
  // every vertical — the platform never restricts a seller to one category.
  const karigar = { id: 'seller_k', archetype: 'karigar' };
  const verticals = ['handicraft', 'gi', 'gems', 'jewellery', 'naturals', 'tourism'];
  let allOk = true;
  for (const vertical of verticals) {
    const r = P.createProduct(
      { title: `${vertical} item`, description: `an authentic ${vertical} product`, vertical, craft: 'x', price_paise: 120000, stock: 3, photos: ['data:image/jpeg;base64,x'] },
      karigar,
    );
    if (!r.ok) { allOk = false; console.log('    (failed on ' + vertical + ': ' + (r.errors || []).join(', ') + ')'); }
  }
  a(allOk, 'Karigar can create a product in every one of the 6 verticals');
  // And the same for a registered exporter — no archetype is locked either
  const niryatak = { id: 'seller_n', archetype: 'niryatak' };
  const expProd = P.createProduct(
    { title: 'export naturals', description: 'bulk natural goods', vertical: 'naturals', craft: 'x', price_paise: 500000, stock: 100, photos: ['data:image/jpeg;base64,x'], export_eligible: true, hsn: '33019090' },
    niryatak,
  );
  a(expProd.ok, 'Niryatak can list outside a single vertical too (with required HSN for export)');
}

// ════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
