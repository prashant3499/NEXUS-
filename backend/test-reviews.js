'use strict';

const R = require('./src/reviews');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const deliveredOrder = { id: 'o1', buyer_id: 'b1', status: 'delivered', items: [{ product_id: 'p1' }] };

sec('Verified-purchase gate');
{
  const ok = R.createReview({ product_id: 'p1', seller_id: 's1', buyer_id: 'b1', rating: 5, text: 'Beautiful work', order: deliveredOrder });
  a(ok.ok === true && ok.review.verified_purchase === true, 'Delivered purchaser can review');
  const noOrder = R.createReview({ product_id: 'p1', buyer_id: 'b1', rating: 5 });
  a(noOrder.ok === false, 'No order → cannot review (kills fake reviews)');
  const notBought = R.createReview({ product_id: 'pX', buyer_id: 'b1', rating: 1, order: deliveredOrder });
  a(notBought.ok === false, 'Reviewing a product you did not buy → blocked');
  const notDelivered = R.createReview({ product_id: 'p1', buyer_id: 'b1', rating: 5, order: { ...deliveredOrder, status: 'placed' } });
  a(notDelivered.ok === false, 'Cannot review before delivery');
  const wrongBuyer = R.createReview({ product_id: 'p1', buyer_id: 'b2', rating: 5, order: deliveredOrder });
  a(wrongBuyer.ok === false, 'Cannot review using someone else\u2019s order');
}

sec('Rating validation');
{
  a(R.createReview({ product_id: 'p1', buyer_id: 'b1', rating: 6, order: deliveredOrder }).ok === false, 'Rating > 5 rejected');
  a(R.createReview({ product_id: 'p1', buyer_id: 'b1', rating: 0, order: deliveredOrder }).ok === false, 'Rating < 1 rejected');
}

sec('Product rating aggregate');
{
  const reviews = [{ rating: 5 }, { rating: 4 }, { rating: 5 }, { rating: 3 }];
  const agg = R.productRating(reviews);
  a(agg.count === 4 && agg.average === 4.3, 'Averages ratings');
  a(agg.distribution[5] === 2, 'Distribution counts each star');
  a(R.productRating([]).average === null, 'No reviews → null average');
}

sec('Maker reputation (volume-weighted, portable)');
{
  const few = R.makerReputation([{ rating: 5 }]);
  const many = R.makerReputation(Array(100).fill({ rating: 5 }));
  a(few.score < many.score, 'One 5-star scores lower than a hundred (volume-weighted)');
  a(many.tier === 'excellent' && many.portable_to_ondc === true, 'High-volume excellent maker, portable to ONDC');
  a(R.makerReputation([]).tier === 'new', 'No reviews → new');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
