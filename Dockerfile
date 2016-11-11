FROM seegno/node:7

# distbin will store data as files in this directory
VOLUME /distbin-db
USER root
RUN mkdir -p /distbin-db
RUN chown -R node /distbin-db
USER node
# read by ./bin/server
ENV DB_DIR=/distbin-db

ENV PORT=8080
EXPOSE 8080
CMD ["--harmony", "bin/server" ]
