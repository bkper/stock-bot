
class EventHandlerTransactionUnchecked {

  handleEvent(event: bkper.Event): string[] | string | boolean {
    let baseBook = BkperApp.getBook(event.bookId);
    const response = new InterceptorFlagRebuild().intercept(baseBook, event);
    if (response) {
      return response;
    }
    return false;
  }

}