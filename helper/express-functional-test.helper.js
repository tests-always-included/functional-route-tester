"use strict";

var debug, FunctionalTest, http;

debug = require("debug")("express-functional-test");
FunctionalTest = require("..").FunctionalTest;
http = require("http");


/**
 * Set up a functional test object using an Express server.
 *
 * The function that is passed into expressFunctionalTestAsync can return
 * immediately or can return a Promise in case the setup is asynchronous.  The
 * returned value isn't used for anything. The initialization function can also
 * accept a node-style callback as the second parameter in order to signal
 * completion, in case Promises are not your thing.
 *
 * Sample usage:
 *
 *   var functionalTest;
 *
 *   beforeEach((done) => {
 *       // Create your server in here.
 *       jasmine.expressFunctionalTestAsync(() => {
 *           var app;
 *
 *           app = express();
 *
 *           // Add your routes and middleware as you normally would.
 *           app.get("/the/path", yourRouteHandler);
 *
 *           // It is even safe for you to call .listen(), which is disabled.
 *           app.listen(3000);
 *       }).then((promiseResult) => {
 *           // Here, the promise result is not what was returned above.
 *           // Instead, it is the functional test object.
 *           functionalTest = promiseResult;
 *       }).then(done, done);
 *
 * It is suggested that you put this sort of code into a helper to tie
 * it into your app correctly.  A helper would also provide a convenient
 * place to graft additional methods onto the FunctionalTest instance.
 *
 * It is also strongly suggested that you use jasmine-test-helpers so
 * tests are able to return a promise and the test's completion is based
 * on that promise.  Far easier than remembering to call the `done` callback.
 *
 * @param {Function} initFunction Initializes express for your app
 * @return {Promise.<FunctionalTest>}
 */
jasmine.expressFunctionalTestAsync = (initFunction) => {
    var functionalTest;


    /**
     * Detects the right way to call a fake on a spy. Allows this code to
     * work with Jasmine 1.x and 2.x.
     *
     * @param {Object} obj
     * @param {string} method
     * @param {Function} fake
     */
    function callFake(obj, method, fake) {
        var spy;

        spy = spyOn(obj, method);

        if (spy.and) {
            spy.and.callFake(fake);
        } else {
            spy.andCallFake(fake);
        }
    }


    /**
     * This is the replacement for http.createServer.  Returns a fake
     * object that has a stubbed `.listen()` method.
     *
     * @param {Function} handler
     * @return {HttpServer}
     */
    function createServerReplacement(handler) {
        debug("Provided a request handler, making FunctionalTest");
        functionalTest = new FunctionalTest(handler, "express");

        // Return a fake server object
        return {
            // Ignore calls to listen and simply call the callback immediately.
            listen: (port, callback) => {
                if (callback) {
                    callback();
                }
            }
        };
    }

    callFake(http, "createServer", createServerReplacement);

    // If this is null after your initialization function, then the
    // initialization function failed to start Express correctly or did
    // not compensate for asynchronous processes.
    functionalTest = null;

    if (initFunction.length > 0) {
        debug("Using a callback for initialization function");

        // If two or more parameters, assume a node-style callback
        // as the second parameter.
        return new Promise((resolve, reject) => {
            initFunction((err) => {
                if (err) {
                    debug("Callback called with an error, rejecting our promise");
                    reject(err);
                } else {
                    debug("Callback called, resolving our promise with FunctionalTest");
                    resolve(functionalTest);
                }
            });
        });
    }

    debug("Using promisified initialization function");

    // For ease, always wrap this in a Promise.  This lets the other function
    // optionally return a promise and it is always handled the same.
    return Promise.resolve(initFunction()).then(() => {
        debug("Promise was resolved, resolving our promise with FunctionalTest");

        return functionalTest;
    });
};
