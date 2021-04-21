BkperApp.setApiKey(PropertiesService.getScriptProperties().getProperty('API_KEY'));

const STOCK_BOOK_PROP = 'stock_book';
const STOCK_EXC_CODE_PROP = 'stock_exc_code';
const STOCK_EXC_ACCOUNT_PROP = 'stock_exchange';
const STOCK_FEES_ACCOUNT_PROP = 'stock_fees_account';
const TRADE_DATE_PROP = 'trade_date';
const INSTRUMENT_PROP = 'instrument';
// const QUANTITY_PROP = 'quantity';
const OPEN_QUANTITY_PROP = 'open_quantity';
const FEES_PROP = 'fees';
const INTEREST_PROP = 'interest';
const NEEDS_REBUILD_PROP = 'needs_rebuild';
const PRICE_PROP = 'price'
const PURCHASE_PRICE_PROP = 'purchase_price';
const PURCHASE_AMOUNT_PROP = 'purchase_amount';
const PURCHASE_QUANTITY_PROP = 'purchase_quantity';
const PARENT_ID = 'parent_id'
const SHORT_SALES_PROP = 'short_sales';
const GAIN_AMOUNT_PROP = 'gain_amount';
const ORIGINAL_QUANTITY_PROP = 'original_quantity';
const ORIGINAL_AMOUNT_PROP = 'original_amount';
const SALE_PRICE_PROP = 'sale_price';
const SALE_AMOUNT_PROP = 'sale_amount';
const SALE_DATE_PROP = 'sale_date';
const EXC_CODE_PROP = 'exc_code';
const ORDER_PROP = 'order';
const STOCK_REALIZED_DATE_PROP = 'stock_realized_date';
const STOCK_SELL_ACCOUNT_NAME = 'Sell';
const STOCK_BUY_ACCOUNT_NAME = 'Buy';
const REALIZED_SUFFIX = 'Realized';
const UREALIZED_SUFFIX = 'Unrealized';


function doGet(e: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {
  //@ts-ignore
  let bookId = e.parameter.bookId;
  //@ts-ignore
  let accountId = e.parameter.accountId;

  return RealizedResultsService.getBotViewTemplate(bookId, accountId);
}

function calculateRealizedResults(bookId: string, accountId: string): Summary {
  if (accountId) {
    let summary = RealizedResultsService.calculateRealizedResultsForAccount(bookId, accountId);
    summary.result = JSON.stringify(summary.result);
    return summary;
  }
}

function resetRealizedResults(bookId: string, accountId: string): Summary {
  if (accountId) {
    return RealizedResultsService.resetRealizedResults(bookId, accountId);
  }
}

function auditBooks(bookId: string) {
  BotService.auditBooks(bookId);
}




