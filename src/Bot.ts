BkperApp.setApiKey(PropertiesService.getScriptProperties().getProperty('API_KEY'));

const STOCK_EXC_CODE_PROP = 'stock_exc_code';
const NEEDS_REBUILD_PROP = 'needs_rebuild';
const PRICE_PROP = 'price';
const ORIGINAL_QUANTITY = 'original_quantity';
const SALE_PRICE_PROP = 'sale_price';
const SALE_DATE_PROP = 'sale_date';
const EXC_CODE_PROP = 'exc_code';

function doGet(e: GoogleAppsScript.Events.AppsScriptHttpRequestEvent) {
  //@ts-ignore
  let bookId = e.parameter.bookId;
  return BotService.getBotViewTemplate(bookId);
}

function calculateRealizedResults(bookId: string): void {
  BotService.calculateRealizedResultsForBook(bookId);
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







