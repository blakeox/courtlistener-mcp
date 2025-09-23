#!/bin/bash

# Test script to verify URL manipulation logic
echo "Testing URL manipulation for health check endpoint fix..."

# Test cases
test_urls=(
    "https://courtlistener-mcp.blakeopowell.workers.dev/health"
    "https://courtlistener-mcp.blakeopowell.workers.dev/health/"
    "https://example.com/health"
    "http://localhost:3000/health"
)

for url in "${test_urls[@]}"; do
    echo ""
    echo "Testing URL: $url"
    
    # Simulate the bash string replacement we're using (improved version)
    mcp_endpoint="${url%/health*}/sse"
    echo "  Health endpoint: $url"
    echo "  MCP endpoint:    $mcp_endpoint"
    
    # Test if the manipulation is correct
    if [[ "$mcp_endpoint" == *"/sse" ]] && [[ "$mcp_endpoint" != *"/health"* ]]; then
        echo "  ✅ URL manipulation correct"
    else
        echo "  ❌ URL manipulation incorrect"
    fi
done

echo ""
echo "URL manipulation test complete!"
