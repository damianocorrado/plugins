import { File, Frame } from "@nativescript/core";

const _determineAvailability = function () {
  const isSimulator = NSProcessInfo.processInfo.environment.objectForKey("SIMULATOR_DEVICE_NAME") !== null;

  if (isSimulator) {
    console.log("Email is not available on the Simulator");
  }

  return !isSimulator && MFMailComposeViewController.canSendMail();
};

export function available() {
  return new Promise(function (resolve, reject) {
    try {
      resolve(_determineAvailability());
    } catch (ex) {
      console.log("Error in email.available: " + ex);
      reject(ex);
    }
  });
};

export function compose(arg) {
  return new Promise(function (resolve, reject) {
    try {

      if (!_determineAvailability()) {
        reject("No mail available");
        return;
      }

      var topMostFrame = Frame.topmost();
      if (topMostFrame) {
        var viewController = topMostFrame.currentPage && topMostFrame.currentPage.ios;
        if (viewController) {
          while (viewController.parentViewController) {
            viewController = viewController.parentViewController;
          }
          while (viewController.presentedViewController) {
            viewController = viewController.presentedViewController;
          }
        }
      }

      const mail = MFMailComposeViewController.new();

      var message = arg.body;
      if (message) {
        var messageAsNSString = NSString.stringWithString(message);
        var isHTML = messageAsNSString.rangeOfStringOptions("<[^>]+>", NSStringCompareOptions.RegularExpressionSearch).location !== NSNotFound;
        mail.setMessageBodyIsHTML(arg.body, isHTML);
      }
      mail.setSubject(arg.subject);
      mail.setToRecipients(arg.to);
      mail.setCcRecipients(arg.cc);
      mail.setBccRecipients(arg.bcc);

      if (arg.attachments) {
        for (var a in arg.attachments) {
          var attachment = arg.attachments[a];
          var path = attachment.path;
          var data = _getDataForAttachmentPath(path);
          if (data === null) {
            reject("File not found for path: " + path);
            return;
          } else if (!attachment.fileName) {
            console.log("attachment.fileName is mandatory");
          } else if (!attachment.mimeType) {
            console.log("attachment.mimeType is mandatory");
          } else {
            mail.addAttachmentDataMimeTypeFileName(
                data, attachment.mimeType, attachment.fileName);
          }
        }
      }

      // Assign first to local variable, otherwise it will be garbage collected since delegate is weak reference.
      var delegate = MFMailComposeViewControllerDelegateImpl.initWithCallback(function (result, error) {
        // invoke the callback / promise
        resolve(result === MFMailComposeResult.Sent);
        // close the mail
        viewController.dismissViewControllerAnimatedCompletion(true, null);
        // release the delegate instance
        CFRelease(delegate);
      });

      // retain the delegate because the mailComposeDelegate property won't do it for us
      CFRetain(delegate);

      mail.mailComposeDelegate = delegate;

      viewController.presentViewControllerAnimatedCompletion(mail, true, null);

    } catch (ex) {
      console.log("Error in email.compose: " + ex);
      reject(ex);
    }
  });
};

function _getDataForAttachmentPath(path) {
  var data = null;
  if (path.indexOf("file:///") === 0) {
    data = _dataForAbsolutePath(path);
  } else if (path.indexOf("file://") === 0) {
    data = _dataForAsset(path);
  } else if (path.indexOf("base64:") === 0) {
    data = _dataFromBase64(path);
  } else {
    var fileManager = NSFileManager.defaultManager;
    if (fileManager.fileExistsAtPath(path)) {
      data = fileManager.contentsAtPath(path);
    }
  }
  return data;
}

function _dataFromBase64(base64String) {
  base64String = base64String.substring(base64String.indexOf("://") + 3);
  return NSData.alloc().initWithBase64EncodedStringOptions(base64String, 0);
}

function _dataForAsset(path) {
  path = path.replace("file://", "/");

  if (!File.exists(path)) {
    console.log("File does not exist: " + path);
    return null;
  }

  var localFile = File.fromPath(path);
  return localFile.readSync(function (e) {
    console.log('read file error:', e);
  });
}

function _dataForAbsolutePath(path) {
  var fileManager = NSFileManager.defaultManager;
  var absPath = path.replace("file://", "");

  if (!fileManager.fileExistsAtPath(absPath)) {
    console.log("File not found: " + absPath);
    return null;
  }

  return fileManager.contentsAtPath(absPath);
}

@NativeClass()
export class MFMailComposeViewControllerDelegateImpl extends NSObject {
  private _callback: (result: any, error: any) => void;
  static ObjCProtocols = [MFMailComposeViewControllerDelegate];
  static initWithCallback(callback: (result: any, error: any) => void) {
    const delegate = <MFMailComposeViewControllerDelegateImpl>MFMailComposeViewControllerDelegateImpl.new();
    delegate._callback = callback;
    return delegate;
  }
  mailComposeControllerDidFinishWithResultError(controller, result, error) {
    this._callback(result, error);
  }
}
