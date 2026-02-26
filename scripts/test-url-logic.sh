#!/bin/bash

echo "Testing URL manipulation logic..."

# Test cases
test_urls=(
    "https://courtlistenermcp.blakeoxford.com/health"
    "https://courtlistenermcp.blakeoxford.com/mcp"
    "https://courtlistenermcp.blakeoxford.com"
    "https://example.com/health"
    "https://example.com/mcp"
)

for url in "${test_urls[@]}"; do
    echo "Testing URL: $url"
    
    # This simulates our workflow logic for MCP endpoint
    if [[ "$url" == *"/health" ]]; then
        mcp_endpoint="${url%/health}/mcp"
    elif [[ "$url" == *"/mcp" ]]; then
        mcp_endpoint="$url"
    else
        mcp_endpoint="$url/mcp"
    fi
    
    # This simulates our workflow logic for health endpoint
    if [[ "$url" == *"/mcp" ]]; then
        health_endpoint="${url%/mcp}/health"
    elif [[ "$url" == *"/health" ]]; then
        health_endpoint="$url"
    else
        health_endpoint="$url/health"
    fi
    
    echo "  → MCP endpoint would be: $mcp_endpoint"
    echo "  → Health check would use: $health_endpoint"
    echo ""
done

echo "✅ URL manipulation tests completed"
