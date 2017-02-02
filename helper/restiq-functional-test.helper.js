"use strict";

var debug, FunctionalTest;

debug = require("debug")("restiq-functional-test");
FunctionalTest = require("..").FunctionalTest;


/**
 * Set up a functional test object using a Restiq server.
 *
 * The function that is passed into restiqFunctionalTestAsync can return
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
 *       // "config" is an object you use for configuring restiq.
 *       // Add necessary bits here to make "config" exist.
 *       jasmine.restiqFunctionalTestAsync((createServer) => {
 *           // Prevent listening
 *           delete config.port;
 *
 *           // Replace the createServer method - use the one provided
 *           config.createServer = createServer;
 *
 *           // Start restiq
 *           restiq.createServer(config);
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
jasmine.restiqFunctionalTestAsync = (initFunction) => {
    var functionalTest;

    /**
     * This is the function passed into the initialization function.
     * It needs to save the request handler.  More could be added later.
     *
     * It does not trigger completion of the initialization.
     *
     * @param {Function} handler
     */
    function useRequestHandler(handler) {
        debug("Provided a request handler, making FunctionalTest");
        functionalTest = new FunctionalTest(handler, "restiq");
    }

    // If this is null after your initialization function, then the
    // initialization function failed to start Restiq correctly or did
    // not compensate for asynchronous processes.
    functionalTest = null;

    if (initFunction.length > 1) {
        debug("Using a callback for initialization function");

        // If two or more parameters, assume a node-style callback
        // as the second parameter.
        return new Promise((resolve, reject) => {
            initFunction(useRequestHandler, (err) => {
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
    return Promise.resolve(initFunction(useRequestHandler)).then(() => {
        debug("Promise was resolved, resolving our promise with FunctionalTest");

        return functionalTest;
    });
};
