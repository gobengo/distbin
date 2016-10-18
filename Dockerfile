FROM seegno/node:7

# Create app directory
#RUN mkdir -p /usr/src/app
#WORKDIR /usr/src/app

# Install app dependencies
#COPY package.json /usr/src/app/
#RUN npm install

# Bundle app source
#COPY . /usr/src/app

ENV PORT=8080
EXPOSE 8080
CMD ["--harmony", "bin/server" ]
