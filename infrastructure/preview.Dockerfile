FROM node:24-alpine
LABEL author="internxt"

WORKDIR /usr/app

COPY package*.json ./

RUN yarn

COPY . ./

CMD yarn dev
