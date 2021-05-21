FROM node:14.16.1-alpine3.10
RUN mkdir /app
WORKDIR /app
COPY package*.json yarn.lock? /app/
RUN yarn install

EXPOSE 3000

CMD ["yarn", "start"]