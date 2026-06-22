'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Search, ShoppingCart, User, Menu, X, Heart, Sun, Moon } from 'lucide-react'
import { useCart } from '@/contexts/cart.context'
import { useTheme } from '@/contexts/theme.context'
import { useStoreConfig } from '@/contexts/store-config.context'
import { Input } from '@/components/atoms/Input/Input'

interface Category {
  name: string
  slug: string
}

interface ProductSuggestion {
  id: string
  name: string
  slug: string
  price: string
  category?: { name: string; slug: string }
}

export function Topbar() {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const { totalItems } = useCart()
  const { theme, toggleTheme } = useTheme()
  const config = useStoreConfig()
  const [categories, setCategories] = useState<Category[]>([])
  const searchContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/api/v1/categories')
      .then(res => res.json())
      .then(data => { if (data.success) setCategories(data.data) })
      .catch(console.error)
  }, [])

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 2) {
      setSuggestions([])
      setIsFetchingSuggestions(false)
      setActiveSuggestionIndex(-1)
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsFetchingSuggestions(true)
        const res = await fetch(`/api/v1/products/suggestions?q=${encodeURIComponent(query)}&limit=8`)
        const data = await res.json()
        setSuggestions(data.data || [])
        setActiveSuggestionIndex(-1)
      } catch (error) {
        console.error(error)
        setSuggestions([])
      } finally {
        setIsFetchingSuggestions(false)
      }
    }, 220)

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!searchContainerRef.current?.contains(event.target as Node)) {
        setIsSuggestionsOpen(false)
        setActiveSuggestionIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const goToSearchResults = (query: string) => {
    const value = query.trim()
    router.push(value ? `/products?search=${encodeURIComponent(value)}` : '/products')
  }

  const selectSuggestion = (slug: string) => {
    setIsSuggestionsOpen(false)
    setIsMenuOpen(false)
    setActiveSuggestionIndex(-1)
    router.push(`/products/${slug}`)
  }

  const onSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
      selectSuggestion(suggestions[activeSuggestionIndex].slug)
      return
    }
    setIsSuggestionsOpen(false)
    setIsMenuOpen(false)
    goToSearchResults(searchQuery)
  }

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSuggestionsOpen || suggestions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestionIndex(prev => (prev + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestionIndex(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1))
    } else if (event.key === 'Escape') {
      setIsSuggestionsOpen(false)
      setActiveSuggestionIndex(-1)
    }
  }

  const SearchDropdown = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="ms-search-dropdown" role="listbox">
      {isFetchingSuggestions && (
        <p className="ms-search-dropdown__status">Searching…</p>
      )}
      {!isFetchingSuggestions && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
        <p className="ms-search-dropdown__status">No matching products</p>
      )}
      {!isFetchingSuggestions && suggestions.map((s, i) => (
        <button
          key={s.id}
          type="button"
          role="option"
          aria-selected={i === activeSuggestionIndex}
          onMouseDown={e => e.preventDefault()}
          onClick={() => selectSuggestion(s.slug)}
          className={`ms-search-dropdown__item${i === activeSuggestionIndex ? ' ms-search-dropdown__item--active' : ''}`}
        >
          <p className="ms-search-dropdown__name">{s.name}</p>
          <p className="ms-search-dropdown__meta">{s.category?.name || 'Product'} · ₹{s.price}</p>
        </button>
      ))}
      {searchQuery.trim().length >= 2 && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            setIsSuggestionsOpen(false)
            if (isMobile) setIsMenuOpen(false)
            goToSearchResults(searchQuery)
          }}
          className="ms-search-dropdown__footer"
        >
          See all results for &ldquo;{searchQuery.trim()}&rdquo;
        </button>
      )}
    </div>
  )

  return (
    <header className="ms-topbar" aria-label="Main navigation">
      {/* Main row */}
      <div className="ms-topbar__inner">
        <Link href="/" className="ms-topbar__wordmark" aria-label={config.store.name}>
          {config.store.name}
        </Link>

        {/* Search — desktop */}
        <div className="ms-topbar__search" ref={searchContainerRef}>
          <form onSubmit={onSearchSubmit} role="search">
            <Input
              type="text"
              placeholder="Search products…"
              value={searchQuery}
              onFocus={() => setIsSuggestionsOpen(true)}
              onChange={e => { setSearchQuery(e.target.value); setIsSuggestionsOpen(true) }}
              onKeyDown={onSearchKeyDown}
              leftIcon={<Search width={16} height={16} />}
              aria-label="Search products"
              aria-autocomplete="list"
              aria-expanded={isSuggestionsOpen}
            />
            {isSuggestionsOpen && <SearchDropdown />}
          </form>
        </div>

        {/* Action buttons */}
        <div className="ms-topbar__actions">
          <button
            className="ms-topbar__action-btn"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Moon width={20} height={20} /> : <Sun width={20} height={20} />}
          </button>

          <Link href="/wishlist" className="ms-topbar__action-btn" aria-label="Wishlist">
            <Heart width={20} height={20} />
          </Link>

          <Link
            href="/cart"
            className="ms-topbar__action-btn"
            aria-label={`Cart, ${totalItems} item${totalItems !== 1 ? 's' : ''}`}
          >
            <ShoppingCart width={20} height={20} />
            {totalItems > 0 && (
              <span className="ms-topbar__cart-badge" aria-hidden="true">{totalItems}</span>
            )}
          </Link>

          <Link href="/account" className="ms-topbar__action-btn" aria-label="Account">
            <User width={20} height={20} />
          </Link>

          <button
            className="ms-topbar__hamburger"
            onClick={() => setIsMenuOpen(prev => !prev)}
            aria-expanded={isMenuOpen}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X width={22} height={22} /> : <Menu width={22} height={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="ms-topbar__mobile-menu">
          <div className="ms-topbar__mobile-search">
            <form onSubmit={onSearchSubmit} role="search">
              <Input
                type="text"
                placeholder="Search products…"
                value={searchQuery}
                onFocus={() => setIsSuggestionsOpen(true)}
                onChange={e => { setSearchQuery(e.target.value); setIsSuggestionsOpen(true) }}
                onKeyDown={onSearchKeyDown}
                leftIcon={<Search width={16} height={16} />}
                aria-label="Search products"
              />
              {isSuggestionsOpen && <SearchDropdown isMobile />}
            </form>
          </div>
          <nav className="ms-topbar__mobile-nav" aria-label="Mobile navigation">
            {[
              { href: '/', label: 'Home' },
              { href: '/products', label: 'Products' },
              { href: '/wishlist', label: 'Wishlist' },
              { href: '/cart', label: `Cart (${totalItems})` },
              { href: '/account', label: 'Account' },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="ms-topbar__mobile-link"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <button
              className="ms-topbar__mobile-link"
              onClick={() => { toggleTheme(); setIsMenuOpen(false) }}
            >
              {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </button>
          </nav>
        </div>
      )}

      {/* Category chip rail — desktop */}
      <nav className="ms-topbar__category-rail" aria-label="Category navigation">
        <Link href="/products" className="ms-topbar__chip">
          All Products
        </Link>
        {categories.map(cat => (
          <Link
            key={cat.slug}
            href={`/products?category=${cat.slug}`}
            className="ms-topbar__chip"
          >
            {cat.name}
          </Link>
        ))}
      </nav>
    </header>
  )
}
