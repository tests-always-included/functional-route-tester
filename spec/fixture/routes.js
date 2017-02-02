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
                done();
            };
        }
    },
    {
        method: "POST",
        path: "/reflect",
        routeFactory: (send) => {
            return (req, res, done) => {
                var body;

                body = "";

                // Flag for restiq
                req._bodyEof = false;
                req.on("data", (moreData) => {
                    body += moreData.toString("utf8");
                });
                req.on("end", () => {
                    // Flag for restiq
                    req._bodyEof = true;
                    send(res, 200, req.headers, body);
                    done();
                });
            };
        }
    }
];
