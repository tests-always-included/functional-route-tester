"use strict";

/* eslint no-underscore-dangle:off */

module.exports = [
    {
        method: "GET",
        path: "/",
        routeFactory: (send) => {
            return (req, res, done) => {
                send(res, 200, {
                    "Content-Type": "text/plain"
                }, "this works");

                if (done) {
                    done();
                }
            };
        }
    },
    {
        method: "POST",
        path: "/reflect",
        routeFactory: (send, framework) => {
            return (req, res, done) => {
                var body;

                if (framework === "express") {
                    // Body was already captured.
                    send(res, 200, req.headers, req.body);

                    if (done) {
                        done();
                    }

                    return;
                }

                // Need to capture the body ourselves.
                body = "";

                // Flag indicating we don't need to read the body.
                req._bodyEof = false;
                req.on("data", (moreData) => {
                    body += moreData.toString("utf8");
                });
                req.on("end", () => {
                    // Flag for restiq
                    req._bodyEof = true;
                    send(res, 200, req.headers, body);

                    if (done) {
                        done();
                    }
                });
            };
        }
    }
];
