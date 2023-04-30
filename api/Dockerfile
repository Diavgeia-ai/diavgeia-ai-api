# Use the official Node.js image as a base image
FROM node:16

# Set the working directory inside the container
WORKDIR /app

COPY package.json .

RUN npm install

# Copy the rest of the application code into the container
COPY . .

# Expose the port your application will run on
EXPOSE 3000

CMD ["npm", "run", "build"]
CMD ["npm", "run", "start"]
