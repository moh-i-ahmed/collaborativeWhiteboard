FROM node:12

# Create app directory
WORKDIR /

# Install app dependencies
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

EXPOSE 8080

# Run application
CMD [ "node", "index.js" ]