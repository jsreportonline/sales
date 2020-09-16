FROM node:12.17.0-alpine3.11
EXPOSE 1500

RUN apk add --update curl

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install --production

COPY . /usr/src/app

EXPOSE 1500

HEALTHCHECK --interval=5s --timeout=2s CMD curl --fail http://localhost:1500 || kill 1

CMD [ "node", "index.js" ]
