"use strict";

var debug, FunctionalTest, http;

debug = require("debug")("restify-functional-test");
FunctionalTest = require("..").FunctionalTest;
http = require("http");


/**
 * Set up a functional test object using a Restify server.
 *
 * The function that is passed into restifyFunctionalTestAsync can return
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
 *       jasmine.restiqFunctionalTestAsync(() => {
 *           var app, config;
 *
 *           // Set up your config object
 *           config = getMyConfiguration();
 *
 *           // Make sure we use http.
 *           [
 *               "cert",
 *               "certificate",
 *               "httpsServerOptions",
 *               "key",
 *               "spdy"
 *           ].forEach((key) => {
 *               if (config[key]) {
 *                   delete config[key];
 *               }
 *           });
 *
 *           app = restify.createServer(key);
 *
 *           // Add your routes and middleware as you normally would.
 *           app.use(yourMiddleware);
 *           app.get("/the/path", yourRouteHandler);
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
 * @param {Function} initFunction Initializes restiq for your app
 * @return {Promise.<FunctionalTest>}
 */
jasmine.restifyFunctionalTestAsync = (initFunction) => {
    var functionalTest, originalCreateServer;


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
     * This is the replacement for http.createServer
     *
     * Catch .on("request") and .listen().
     *
     * @return {HttpServer}
     */
    function createServerReplacement() {
        var originalOn, server;

        server = originalCreateServer.call(http);

        // Ignore calls to listen and simply call the callback immediately.
        callFake(server, "listen", (port, callback) => {
            if (callback) {
                callback();
            }
        });

        // Catch calls to on("request") and make the FunctionalTest instance.
        originalOn = server.on;
        callFake(server, "on", (eventType, callback) => {
            if (eventType === "request") {
                debug("Provided a request handler, making FunctionalTest");
                functionalTest = new FunctionalTest(callback, "restify");
            } else {
                originalOn.call(server, eventType, callback);
            }
        });

        return server;
    }

    originalCreateServer = http.createServer;
    callFake(http, "createServer", createServerReplacement);

    // If this is null after your initialization function, then the
    // initialization function failed to start Restiq correctly or did
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
