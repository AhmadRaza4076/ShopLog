/** Demo ledger built from Appollo, Phoenix Homewares, and Kiwi Collection price lists (Apr 2026). */

export interface SeedTxn {
  type: 'sale' | 'purchase' | 'payment' | 'credit_given';
  item_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number;
  customer_name: string | null;
  is_credit: boolean;
  daysAgo: number;
}

export const CUSTOMER_PHONES: Record<string, string> = {
  'Ali Raza': '03001234567',
  'Sana Tariq': '03009876543',
  'Bilal Hussain': '03001112233',
};

export const SEED_DATA: SeedTxn[] = [
  // —— Appollo HW Price List (03-Apr-26) — stock purchases ——
  { type: 'purchase', item_name: 'Mini Lunch Box with spoon', quantity: 36, unit_price: 150, total_amount: 5400, customer_name: null, is_credit: false, daysAgo: 18 },
  { type: 'purchase', item_name: 'Jonti Lunch Box with spoon', quantity: 24, unit_price: 160, total_amount: 3840, customer_name: null, is_credit: false, daysAgo: 18 },
  { type: 'purchase', item_name: 'Bento Lunch Box M-1 (Kids)', quantity: 12, unit_price: 280, total_amount: 3360, customer_name: null, is_credit: false, daysAgo: 17 },
  { type: 'purchase', item_name: 'Spring Water Bottle (S) 650ml', quantity: 48, unit_price: 180, total_amount: 8640, customer_name: null, is_credit: false, daysAgo: 16 },
  { type: 'purchase', item_name: 'Hunter Water Bottle (M) 950ml', quantity: 24, unit_price: 470, total_amount: 11280, customer_name: null, is_credit: false, daysAgo: 16 },
  { type: 'purchase', item_name: 'Premio Bowl (M) 1200ml', quantity: 72, unit_price: 120, total_amount: 8640, customer_name: null, is_credit: false, daysAgo: 15 },
  { type: 'purchase', item_name: 'Rio Rice Strainer', quantity: 36, unit_price: 200, total_amount: 7200, customer_name: null, is_credit: false, daysAgo: 14 },
  { type: 'purchase', item_name: 'Delight Multipurpose Basket (3pcs Set)', quantity: 20, unit_price: 370, total_amount: 7400, customer_name: null, is_credit: false, daysAgo: 14 },
  { type: 'purchase', item_name: 'Mayo Squeeze Bottle (M) 600ml', quantity: 40, unit_price: 150, total_amount: 6000, customer_name: null, is_credit: false, daysAgo: 13 },
  { type: 'purchase', item_name: 'Bubble Ice Cube Tray', quantity: 60, unit_price: 200, total_amount: 12000, customer_name: null, is_credit: false, daysAgo: 13 },

  // —— Phoenix Homewares PL (06-Apr-26) ——
  { type: 'purchase', item_name: 'Teddy Potty Chair', quantity: 8, unit_price: 610, total_amount: 4880, customer_name: null, is_credit: false, daysAgo: 12 },
  { type: 'purchase', item_name: 'Luxury Basket Small', quantity: 16, unit_price: 680, total_amount: 10880, customer_name: null, is_credit: false, daysAgo: 12 },
  { type: 'purchase', item_name: 'Storage Basket (A4 size Tray)', quantity: 24, unit_price: 250, total_amount: 6000, customer_name: null, is_credit: false, daysAgo: 11 },
  { type: 'purchase', item_name: 'Flat Top 3 Draws (W)', quantity: 12, unit_price: 470, total_amount: 5640, customer_name: null, is_credit: false, daysAgo: 11 },
  { type: 'purchase', item_name: 'Smart Drawers (3 in 1)', quantity: 8, unit_price: 1025, total_amount: 8200, customer_name: null, is_credit: false, daysAgo: 10 },
  { type: 'purchase', item_name: 'Summer Cool Mug', quantity: 48, unit_price: 68, total_amount: 3264, customer_name: null, is_credit: false, daysAgo: 10 },
  { type: 'purchase', item_name: 'Clear Jug 2', quantity: 16, unit_price: 370, total_amount: 5920, customer_name: null, is_credit: false, daysAgo: 9 },
  { type: 'purchase', item_name: 'Summer cool jug', quantity: 32, unit_price: 223, total_amount: 7136, customer_name: null, is_credit: false, daysAgo: 9 },
  { type: 'purchase', item_name: 'Sink Aid', quantity: 60, unit_price: 152, total_amount: 9120, customer_name: null, is_credit: false, daysAgo: 8 },
  { type: 'purchase', item_name: 'Laundry Basket (TOKRA)', quantity: 15, unit_price: 915, total_amount: 13725, customer_name: null, is_credit: false, daysAgo: 8 },

  // —— Kiwi Collection PL (01-Apr-26) ——
  { type: 'purchase', item_name: 'Knit & Knot Medium 3 Draws', quantity: 2, unit_price: 3185, total_amount: 6370, customer_name: null, is_credit: false, daysAgo: 7 },
  { type: 'purchase', item_name: 'Knit & Knot Basket (Medium)', quantity: 48, unit_price: 210, total_amount: 10080, customer_name: null, is_credit: false, daysAgo: 7 },
  { type: 'purchase', item_name: 'Knit & Knot Basket (Large)', quantity: 24, unit_price: 310, total_amount: 7440, customer_name: null, is_credit: false, daysAgo: 6 },
  { type: 'purchase', item_name: 'Summer Desire Jug', quantity: 24, unit_price: 290, total_amount: 6960, customer_name: null, is_credit: false, daysAgo: 6 },
  { type: 'purchase', item_name: 'Luxury Line (Small)', quantity: 72, unit_price: 100, total_amount: 7200, customer_name: null, is_credit: false, daysAgo: 5 },
  { type: 'purchase', item_name: 'Jute Square Basket (Medium)', quantity: 36, unit_price: 150, total_amount: 5400, customer_name: null, is_credit: false, daysAgo: 5 },
  { type: 'purchase', item_name: 'Kiwi Bath Mug', quantity: 96, unit_price: 120, total_amount: 11520, customer_name: null, is_credit: false, daysAgo: 4 },
  { type: 'purchase', item_name: 'Grace Tub No. 03 25 Liter', quantity: 12, unit_price: 790, total_amount: 9480, customer_name: null, is_credit: false, daysAgo: 4 },
  { type: 'purchase', item_name: 'Bucket Steel Handle No. 03 14 Liter', quantity: 24, unit_price: 485, total_amount: 11640, customer_name: null, is_credit: false, daysAgo: 3 },
  { type: 'purchase', item_name: 'Rainbow Glass 6 Pcs', quantity: 48, unit_price: 300, total_amount: 14400, customer_name: null, is_credit: false, daysAgo: 3 },

  // —— Credit sales & payments (shop activity) ——
  { type: 'sale', item_name: 'Mini Lunch Box with spoon', quantity: 5, unit_price: 180, total_amount: 900, customer_name: 'Ali Raza', is_credit: true, daysAgo: 10 },
  { type: 'sale', item_name: 'Luxury Basket Small', quantity: 2, unit_price: 820, total_amount: 1640, customer_name: 'Ali Raza', is_credit: true, daysAgo: 9 },
  { type: 'sale', item_name: 'Knit & Knot Basket (Medium)', quantity: 3, unit_price: 260, total_amount: 780, customer_name: 'Sana Tariq', is_credit: true, daysAgo: 8 },
  { type: 'sale', item_name: 'Spring Water Bottle (S) 650ml', quantity: 4, unit_price: 220, total_amount: 880, customer_name: 'Sana Tariq', is_credit: true, daysAgo: 7 },
  { type: 'sale', item_name: 'Summer Cool Mug', quantity: 6, unit_price: 85, total_amount: 510, customer_name: 'Bilal Hussain', is_credit: false, daysAgo: 6 },
  { type: 'payment', item_name: null, quantity: null, unit_price: null, total_amount: 1500, customer_name: 'Ali Raza', is_credit: false, daysAgo: 5 },
  { type: 'sale', item_name: 'Summer Desire Jug', quantity: 2, unit_price: 350, total_amount: 700, customer_name: 'Ali Raza', is_credit: true, daysAgo: 4 },
  { type: 'payment', item_name: null, quantity: null, unit_price: null, total_amount: 500, customer_name: 'Sana Tariq', is_credit: false, daysAgo: 3 },
  { type: 'sale', item_name: 'Premio Bowl (M) 1200ml', quantity: 2, unit_price: 145, total_amount: 290, customer_name: 'Sana Tariq', is_credit: true, daysAgo: 2 },
  { type: 'sale', item_name: 'Kiwi Bath Mug', quantity: 3, unit_price: 150, total_amount: 450, customer_name: 'Ali Raza', is_credit: true, daysAgo: 1 },
  { type: 'sale', item_name: 'Flat Top 3 Draws (W)', quantity: 1, unit_price: 560, total_amount: 560, customer_name: 'Bilal Hussain', is_credit: false, daysAgo: 0 },
];
