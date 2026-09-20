FROM ruby:3.4-slim AS build

WORKDIR /site

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential git \
  && rm -rf /var/lib/apt/lists/*

COPY Gemfile Gemfile.lock ./
RUN gem install bundler && bundle install

COPY . .
ENV JEKYLL_ENV=production
RUN bundle exec jekyll build --strict_front_matter

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/_site /usr/share/nginx/html

EXPOSE 80
