BkperApp.setApiKey(PropertiesService.getScriptProperties().getProperty('API_KEY'));

/**
 * Trigger called upon transaction posted
 */
function onTransactionPosted(event) {

  let bookId = event.bookId;
  let operation = event.data.object;
  let transaction = operation.transaction;
  
  var book = BkperApp.getBook(bookId);
}

