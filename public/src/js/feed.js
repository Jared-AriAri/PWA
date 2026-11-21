
'use strict';

var shareImageButton = document.querySelector('#share-image-button');
var createPostArea = document.querySelector('#create-post');
var closeCreatePostModalButton = document.querySelector('#close-create-post-modal-btn');
var sharedMomentsArea = document.querySelector('#shared-moments');
var form = document.querySelector('form');
var titleInput = document.querySelector('#title');
var locationInput = document.querySelector('#location');

var url = 'https://mi-firebase-8827a-default-rtdb.firebaseio.com/post.json';
var postImage = 'https://firebasestorage.googleapis.com/v0/b/mi-firebase-8827a.firebasestorage.app/o/sf-boat.jpg?alt=media&token=d6aa2254-d560-4f4d-a420-1c608da300b0';
var networkDataReceived = false;

function openCreatePostModal() {
    if (createPostArea) {
        createPostArea.style.transform = 'translateY(0)';
    }
}

function closeCreatePostModal() {
    if (createPostArea) {
        createPostArea.style.transform = 'translateY(100vh)';
    }
}

if (shareImageButton) {
    shareImageButton.addEventListener('click', openCreatePostModal);
}

if (closeCreatePostModalButton) {
    closeCreatePostModalButton.addEventListener('click', closeCreatePostModal);
}

function clearCards() {
    if (!sharedMomentsArea) return;

    while (sharedMomentsArea.firstChild) {
        sharedMomentsArea.removeChild(sharedMomentsArea.firstChild);
    }
}

function createCard(data) {
    if (!sharedMomentsArea) return;

    var cardWrapper = document.createElement('div');
    cardWrapper.className = 'shared-moment-card mdl-card mdl-shadow--2dp';

    var cardTitle = document.createElement('div');
    cardTitle.className = 'mdl-card__title';
    cardTitle.style.backgroundImage = 'url("' + postImage + '")';
    cardTitle.style.backgroundSize = 'cover';
    cardTitle.style.backgroundPosition = 'center';
    cardTitle.style.height = '180px';

    var cardTitleTextElement = document.createElement('h2');
    cardTitleTextElement.className = 'mdl-card__title-text';
    cardTitleTextElement.textContent = data.title || '';
    cardTitleTextElement.style.color = 'white';

    cardTitle.appendChild(cardTitleTextElement);
    cardWrapper.appendChild(cardTitle);

    var cardSupportingText = document.createElement('div');
    cardSupportingText.className = 'mdl-card__supporting-text';
    cardSupportingText.textContent = data.location || '';
    cardSupportingText.style.textAlign = 'center';

    cardWrapper.appendChild(cardSupportingText);

    if (typeof componentHandler !== 'undefined') {
        componentHandler.upgradeElement(cardWrapper);
    }

    sharedMomentsArea.appendChild(cardWrapper);
}

function updateUI(data) {
    clearCards();

    if (!Array.isArray(data)) return;

    data.forEach(function (post) {
        createCard(post);
    });
}

function convertDataToArray(data) {
    if (!data || typeof data !== 'object') return [];

    return Object.keys(data).map(function (key) {
        var post = data[key];

        if (!post || typeof post !== 'object') return null;

        return Object.assign({}, post, {
            id: post.id || key
        });
    }).filter(Boolean);
}

function loadPosts() {
    return fetch(url)
        .then(function (res) {
            if (!res.ok) {
                throw new Error('Firebase HTTP: ' + res.status);
            }

            return res.json();
        })
        .then(function (data) {
            networkDataReceived = true;

            var posts = convertDataToArray(data);

            console.log('From web:', posts);
            updateUI(posts);

            if ('indexedDB' in window) {
                return clearAllData('posts')
                    .then(function () {
                        return Promise.all(
                            posts.map(function (post) {
                                return writeData('posts', post);
                            })
                        );
                    })
                    .then(function () {
                        console.log('IndexedDB actualizada');
                    });
            }
        })
        .catch(function (err) {
            console.error('Error al cargar publicaciones:', err);
        });
}

if ('indexedDB' in window) {
    readAllData('posts')
        .then(function (data) {
            if (!networkDataReceived) {
                console.log('From cache:', data);
                updateUI(data);
            }
        })
        .catch(function (err) {
            console.error('Error IndexedDB:', err);
        });
}

loadPosts();

function sendData(post) {
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(post)
    })
        .then(function (res) {
            if (!res.ok) {
                throw new Error('Firebase HTTP: ' + res.status);
            }

            return res.json();
        })
        .then(function () {
            console.log('Publicación enviada');
            return loadPosts();
        });
}

function showMessage(message) {
    var snackbar = document.querySelector('#confirmation-toast');

    if (snackbar && snackbar.MaterialSnackbar) {
        snackbar.MaterialSnackbar.showSnackbar({
            message: message
        });
    } else {
        console.log(message);
    }
}

if (form) {
    form.addEventListener('submit', function (event) {
        event.preventDefault();

        if (
            !titleInput ||
            !locationInput ||
            !titleInput.value.trim() ||
            !locationInput.value.trim()
        ) {
            alert('Completa todos los campos');
            return;
        }

        var post = {
            id: new Date().toISOString(),
            title: titleInput.value.trim(),
            location: locationInput.value.trim(),
            image: postImage
        };

        if (
            'serviceWorker' in navigator &&
            'SyncManager' in window &&
            'indexedDB' in window
        ) {
            navigator.serviceWorker.ready
                .then(function (sw) {
                    return writeData('sync-posts', post)
                        .then(function () {
                            return sw.sync.register('sync-new-posts');
                        });
                })
                .then(function () {
                    closeCreatePostModal();
                    form.reset();
                    showMessage('Publicación guardada para sincronizar');
                })
                .catch(function (err) {
                    console.error('Error de sincronización:', err);
                    alert('No se pudo guardar la publicación');
                });
        } else {
            sendData(post)
                .then(function () {
                    closeCreatePostModal();
                    form.reset();
                    showMessage('Publicación enviada correctamente');
                })
                .catch(function (err) {
                    console.error('Error al enviar:', err);
                    alert('No se pudo enviar la publicación');
                });
        }
    });
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'POSTS_SYNCED') {
            loadPosts();
        }
    });
}

window.addEventListener('online', function () {
    loadPosts();

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then(function (sw) {
                return sw.sync.register('sync-new-posts');
            })
            .catch(console.error);
    }
});

