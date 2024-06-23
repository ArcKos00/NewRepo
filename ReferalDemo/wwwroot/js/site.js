(function (d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) {
        return;
    }
    js = d.createElement(s);
    js.id = id;
    js.src = "//connect.facebook.com/en_US/messenger.Extensions.js";
    fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'Messenger'));

window.extAsyncInit = function () {
    var sss = MessengerExtensions;
    MessengerExtensions.getSupportedFeatures(function success(result) {
        let features = result.supported_features;
        if (features.indexOf("context") != -1) {
            MessengerExtensions.getContext('1566148437275253',
                function success(thread_context) {
                    document.getElementById("user-id").value = thread_context.psid;
                },
                function error(err) {
                    console.log(err);
                }
            );
        }
    }, function error(err) {
        console.log(err);
    });
};