FROM node:12

# Create app directory
WORKDIR /

# Install app dependencies
COPY package*.json ./

RUN npm install
RUN apt-get update
RUN DEBIAN_FRONTEND=noninteractive apt-get -y install redis-server
RUN redis-server &

# Bundle app source
COPY ./ ./

EXPOSE 8080

# Run application
CMD [ "node", "index.js" ]