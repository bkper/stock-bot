BkperApp.setApiKey(PropertiesService.getScriptProperties().getProperty('API_KEY'));

const STOCK_BOOK_PROP = 'stock_book';
const STOCK_EXC_CODE_PROP = 'stock_exc_code';
const STOCK_EXC_ACCOUNT_PROP = 'stock_exchange';
const STOCK_FEES_ACCOUNT_PROP = 'stock_fees_account';
const TRADE_DATE_PROP = 'trade_date';
const INSTRUMENT_PROP = 'instrument';
// const QUANTITY_PROP = 'quantity';
const OPEN_QUANTITY_PROP = 'open_quantity';
const HIST_QUANTITY_PROP = 'hist_quantity';
const FEES_PROP = 'fees';
const INTEREST_PROP = 'interest';
const NEEDS_REBUILD_PROP = 'needs_rebuild';
const PRICE_PROP = 'price'
const PURCHASE_PRICE_PROP = 'purchase_price';
const FWD_PURCHASE_PRICE_PROP = 'fwd_purchase_price';
const PURCHASE_AMOUNT_PROP = 'purchase_amount';
const FWD_PURCHASE_AMOUNT_PROP = 'fwd_purchase_amount';
const PURCHASE_QUANTITY_PROP = 'purchase_quantity';
const PARENT_ID = 'parent_id'
const SHORT_SALE_PROP = 'short_sale';
const GAIN_AMOUNT_PROP = 'gain_amount';
const PURCHASE_LOG_PROP = 'purchase_log';
const FWD_PURCHASE_LOG_PROP = 'fwd_purchase_log';
const ORIGINAL_QUANTITY_PROP = 'original_quantity';
const ORIGINAL_AMOUNT_PROP = 'original_amount';
const SALE_PRICE_PROP = 'sale_price';
const FWD_SALE_PRICE_PROP = 'fwd_sale_price';
const SALE_AMOUNT_PROP = 'sale_amount';
const FWD_SALE_AMOUNT_PROP = 'fwd_sale_amount';
const SALE_DATE_PROP = 'sale_date';
const EXC_CODE_PROP = 'exc_code';
const EXC_BASE_PROP = 'exc_base';
const EXC_RATE_PROP = 'exc_rate';
const EXC_AMOUNT_PROP = 'exc_amount';
const EXC_ACCOUNT_PROP = 'exc_account';
const PURCHASE_EXC_RATE_PROP = 'purchase_exc_rate';
const FWD_PURCHASE_EXC_RATE_PROP = 'fwd_purchase_exc_rate';
const SALE_EXC_RATE_PROP = 'sale_exc_rate';
const FWD_SALE_EXC_RATE_PROP = 'fwd_sale_exc_rate';
const ORDER_PROP = 'order';
const HIST_ORDER_PROP = 'hist_order';
const DATE_PROP = 'date';
const REALIZED_DATE_PROP = 'realized_date';
const LEGACY_REALIZED_DATE_PROP = 'stock_realized_date';
const FORWARDED_DATE_PROP = 'forwarded_date';
const STOCK_SELL_ACCOUNT_NAME = 'Sell';
const STOCK_BUY_ACCOUNT_NAME = 'Buy';
const REALIZED_SUFFIX = 'Realized';
const UREALIZED_SUFFIX = 'Unrealized';

const REPORT_CLOSING_DATE_PROP = 'report_closing_date';
const PREV_CLOSING_DATE_PROP = 'prev_closing_date';
const QUANTITY_PROP = 'quantity';
const SELL_ACCOUNT_NAME = 'Sell'
const BUY_ACCOUNT_NAME = 'Buy'
const ORIGINAL_PURCHASE_PRICE = 'orig_purchase_price'
const ORIGINAL_SALE_PRICE = 'orig_sale_price'
const TRADING = 'Trading';


function doGet(e: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {
  //@ts-ignore
  let bookId = e.parameter.bookId;
  //@ts-ignore
  let accountId = e.parameter.accountId;
  //@ts-ignore
  let groupId = e.parameter.groupId;

  return BotViewService.getBotViewTemplate(bookId, accountId, groupId);
}

function calculateRealizedResults(bookId: string, accountId: string, autoMtM: boolean): Summary {
  if (accountId) {
    let summary = RealizedResultsService.calculateRealizedResultsForAccount(bookId, accountId, autoMtM);
    summary.result = JSON.stringify(summary.result);
    return summary;
  }
}

function updateAccountsToDate(bookId: string, accountId: string, date: string): Summary {
  if (accountId) {
    let summary = ForwardDateService.forwardDate(bookId, accountId, date);
    summary.result = JSON.stringify(summary.result);
    return summary;
  }
}

function resetRealizedResults(bookId: string, accountId: string): Summary {
  if (accountId) {
    let summary = RealizedResultsService.resetRealizedResults(bookId, accountId, false);
    return summary;
  }
}

function fullResetRealizedResults(bookId: string, accountId: string): Summary {
  if (accountId) {
    let summary = RealizedResultsService.resetRealizedResults(bookId, accountId, true);
    return summary;
  }
}

function auditBooks(bookId: string) {
  //BotService.auditBooks(bookId);
}
