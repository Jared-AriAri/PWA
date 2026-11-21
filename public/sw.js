
importScripts('/src/js/idb.js', '/src/js/utility.js');

var CACHE_STATIC_NAME = 'static-v9';
var CACHE_DYNAMIC_NAME = 'dynamic-v9';
var FIREBASE_URL = 'https://mi-firebase-8827a-default-rtdb.firebaseio.com/post.json';

var STATIC_FILES = [
    '/',
    '/index.html',
    '/help/index.html',
    '/offline.html',
    '/src/css/app.css',
    '/src/css/feed.css',
    '/src/css/help.css',
    '/src/js/app.js',
    '/src/js/feed.js',
    '/src/js/idb.js',
    '/src/js/utility.js',
    '/src/js/material.min.js',
    '/src/images/main-image-lg.jpg',
    '/src/images/main-image-small.jpg',
    '/src/images/main-image.jpg'
];

var EXTERNAL_FILES = [
    'https://fonts.googleapis.com/css?family=Roboto:400,700',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME)
            .then(function (cache) {
                return cache.addAll(STATIC_FILES);
            })
            .then(function () {
                return caches.open(CACHE_STATIC_NAME);
            })
            .then(function (cache) {
                return Promise.all(EXTERNAL_FILES.map(function (url) {
                    return cache.add(url).catch(function () { });
                }));
            })
            .then(function () {
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.map(function (key) {
                    if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
                        return caches.delete(key);
                    }
                }));
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

self.addEventListener('fetch', function (event) {
    var request = event.request;

    if (request.url === FIREBASE_URL && request.method === 'GET') {
        event.respondWith(
            fetch(request).then(function (res) {
                if (res.ok) {
                    var save = res.clone().json().then(function (data) {
                        return clearAllData('posts').then(function () {
                            return Promise.all(Object.keys(data || {}).map(function (key) {
                                var post = data[key];

                                if (!post || typeof post !== 'object') {
                                    return Promise.resolve();
                                }

                                post.id = post.id || key;
                                return writeData('posts', post);
                            }));
                        });
                    }).catch(console.error);

                    event.waitUntil(save);
                }

                return res;
            })
        );
    } else if (
        request.method === 'GET' &&
        new URL(request.url).origin === self.location.origin &&
        STATIC_FILES.includes(new URL(request.url).pathname)
    ) {
        event.respondWith(
            caches.match(request).then(function (res) {
                return res || fetch(request);
            })
        );
    } else if (request.method === 'GET') {
        event.respondWith(
            caches.match(request).then(function (res) {
                if (res) return res;

                return fetch(request).then(function (response) {
                    if (
                        !response.ok ||
                        new URL(request.url).origin !== self.location.origin
                    ) {
                        return response;
                    }

                    var copy = response.clone();

                    event.waitUntil(
                        caches.open(CACHE_DYNAMIC_NAME).then(function (cache) {
                            return cache.put(request, copy);
                        })
                    );

                    return response;
                }).catch(function () {
                    if ((request.headers.get('accept') || '').includes('text/html')) {
                        return caches.match('/offline.html');
                    }

                    return Response.error();
                });
            })
        );
    }
});

self.addEventListener('sync', function (event) {
    if (event.tag === 'sync-new-posts') {
        event.waitUntil(
            readAllData('sync-posts')
                .then(function (data) {
                    return Promise.all(data.map(function (post) {
                        return fetch(FIREBASE_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                id: post.id,
                                title: post.title,
                                location: post.location,
                                image: post.image
                            })
                        })
                            .then(function (res) {
                                if (!res.ok) {
                                    throw new Error('Firebase HTTP: ' + res.status);
                                }

                                return deleteItemFromData('sync-posts', post.id);
                            });
                    }));
                })
                .then(function () {
                    return self.clients.matchAll({
                        type: 'window',
                        includeUncontrolled: true
                    });
                })
                .then(function (clients) {
                    clients.forEach(function (client) {
                        client.postMessage({
                            type: 'POSTS_SYNCED'
                        });
                    });
                })
                .catch(function (err) {
                    console.error('Error de sincronización:', err);
                    throw err;
                })
        );
    }
});
