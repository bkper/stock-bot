BkperApp.setApiKey(PropertiesService.getScriptProperties().getProperty('API_KEY'));

const STOCK_EXC_CODE_PROP = 'stock_exc_code';
const STOCK_EXC_ACCOUNT_PROP = 'stock_exchange';
const STOCK_UNREALIZED_ACCOUNT_PROP = 'stock_unreal_account';
const STOCK_GAIN_ACCOUNT_PROP = 'stock_gain_account';
const STOCK_LOSS_ACCOUNT_PROP = 'stock_loss_account';
const STOCK_FEES_ACCOUNT_PROP = 'stock_fees_account';
const TRADE_DATE_PROP = 'trade_date';
const INSTRUMENT_PROP = 'instrument';
const QUANTITY_PROP = 'quantity';
const OPEN_QUANTITY_PROP = 'open_quantity';
const FEES_PROP = 'fees';
const INTEREST_PROP = 'interest';
const NEEDS_REBUILD_PROP = 'needs_rebuild';
const PRICE_PROP = 'price'
const PURCHASE_PRICE_PROP = 'purchase_price';
const PURCHASE_AMOUNT_PROP = 'purchase_amount';
const PURCHASE_QUANTITY_PROP = 'purchase_quantity';

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
const REALIZED_GAIN_SUFFIX = 'Realized Gain';
const REALIZED_LOSS_SUFFIX = 'Realized Loss';
const UREALIZED_SUFFIX = 'Unrealized';


function doGet(e: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {
  //@ts-ignore
  let bookId = e.parameter.bookId;
  //@ts-ignore
  let accountId = e.parameter.accountId;

  return RealizedResultsService.getBotViewTemplate(bookId, accountId);
}

function calculateRealizedResults(bookId: string, accountId: string): string {
  if (accountId) {
    const summary = RealizedResultsService.calculateRealizedResultsForAccount(bookId, accountId);
    const summaryJSON = JSON.stringify(summary, null, 2);
    return summaryJSON != JSON.stringify({}, null, 2) ? summaryJSON: 'Done.';
  } else {
    const summary = RealizedResultsService.calculateRealizedResultsForBook(bookId);
    const summaryJSON = JSON.stringify(summary, null, 2);
    return summaryJSON != JSON.stringify({}, null, 2) ? summaryJSON: 'Done.';
  }
}

function resetRealizedResults(bookId: string, accountId: string): string {
  if (accountId) {
    const account = RealizedResultsService.resetRealizedResults(bookId, accountId);
    return `Reseted Realized Results for ${account.getName()}`;
  }
}


function onTransactionPosted(event: bkper.Event) {
  return new EventHandlerTransactionPosted().handleEvent(event);
}

function onTransactionChecked(event: bkper.Event) {
  return new EventHandlerTransactionChecked().handleEvent(event);
}

function onTransactionUnchecked(event: bkper.Event) {
  return new EventHandlerTransactionUnchecked().handleEvent(event);
}

function onTransactionUpdated(event: bkper.Event) {
  return new EventHandlerTransactionUpdated().handleEvent(event);
}

function onTransactionDeleted(event: bkper.Event) {
  return new EventHandlerTransactionDeleted().handleEvent(event);
}

function onTransactionRestored(event: bkper.Event) {
  return new EventHandlerTransactionRestored().handleEvent(event);
}

function onAccountCreated(event: bkper.Event) {
  return new EventHandlerAccountCreatedOrUpdated().handleEvent(event);
}

function onAccountUpdated(event: bkper.Event) {
  return new EventHandlerAccountCreatedOrUpdated().handleEvent(event);
}

function onAccountDeleted(event: bkper.Event) {
  return new EventHandlerAccountDeleted().handleEvent(event);
}

function onGroupCreated(event: bkper.Event) {
  return new EventHandlerGroupCreatedOrUpdated().handleEvent(event);
}

function onGroupUpdated(event: bkper.Event) {
  return new EventHandlerGroupCreatedOrUpdated().handleEvent(event);
}

function onGroupDeleted(event: bkper.Event) {
  return new EventHandlerGroupDeleted().handleEvent(event);
}







