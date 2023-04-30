# Use the official Node.js image as a base image
FROM node:16

# Set the working directory inside the container
WORKDIR /app

# Copy the rest of the application code into the container
COPY . .

# Install the required dependencies
RUN npm i

# Expose the port your application will run on
EXPOSE 3000

CMD ["npm", "run", "build"]
CMD ["npm", "run", "forever"]
