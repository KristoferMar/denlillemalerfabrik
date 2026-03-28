#!/bin/bash

THEME="187606696322"
STORE="den-lille-malerfabrik.myshopify.com"

case "$1" in
  push)
    shopify theme push --theme "$THEME" --store "$STORE"
    ;;
  pull)
    shopify theme pull --theme "$THEME" --store "$STORE"
    ;;
  dev)
    shopify theme dev --store "$STORE" --theme "$THEME"
    ;;
  *)
    echo "Usage: ./shopify.sh [push|pull|dev]"
    ;;
esac
